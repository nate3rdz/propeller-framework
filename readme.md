# Propeller Framework

Propeller is a TypeScript framework built on top of Express that lets you write HTTP endpoints as **classes**, keeping auth, validation, middleware and business logic cleanly separated and strongly typed.

Instead of writing loose route handlers, you define each endpoint as a class that declares its own path, method, auth requirements, validators and middlewares. Propeller takes care of the execution flow.

---

## Table of contents

- [Installation](#installation)
- [Setup](#setup)
- [Core concepts](#core-concepts)
  - [Endpoint](#endpoint)
  - [EndpointValidator](#endpointvalidator)
  - [EndpointMiddleware](#endpointmiddleware)
  - [InternalAPIError](#internalapierror)
  - [Router](#router)
- [Services](#services)
  - [AuthService](#authservice)
  - [PropellerLogger](#propellerlogger)
  - [PermissionsService](#permissionsservice)
- [Database utilities](#database-utilities)
- [Environment variables](#environment-variables)
- [Full example](#full-example)

---

## Installation

```bash
npm install propeller-framework
```

Propeller requires Express and TypeORM as peer dependencies:

```bash
npm install express typeorm
npm install -D @types/express
```

Your `tsconfig.json` must have decorators enabled:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

---

## Setup

Call `configure()` once at startup, before the server starts listening. This is where you tell Propeller how to load the authenticated user and how to read their permissions.

```ts
import { configure } from 'propeller-framework';
import { AppDataSource } from './data-source';
import { User } from './entities/User';

// Define your app's permission type for full autocomplete
const permissions = ['admin', 'moderator', 'read-only'] as const;
export type AppPermissions = typeof permissions[number];
export type AppUser = User;

configure({
  appName: 'MyApp',
  baseUrl: '/api/v1',
  permissions,

  // Called on every authenticated request — return the account or null
  accountResolver: (userId) =>
    AppDataSource.getRepository(User).findOne({ where: { id: userId } }),

  // Called after accountResolver — return the user's permissions as strings
  permissionsResolver: (user) => user.roles.map((r) => r.name),
});
```

---

## Core concepts

### Endpoint

The main building block. Extend `Endpoint` to define a route.

```ts
import { Endpoint } from 'propeller-framework';
import { Request, Response } from 'express';
import { AppUser, AppPermissions } from './config';

// Generics: <Request, Response, OutputType, AccountType, PermissionsType>
export class GetProfileEndpoint extends Endpoint<Request, Response, { name: string }, AppUser, AppPermissions> {

  setValidators() {
    this.path = '/user/profile';
    this.method = 'get';
    this.auth = true;                          // requires a valid JWT
    this.requiredPermissions = ['read-only'];   // typed — autocomplete works

    this.function = async (req, res) => {
      const { account } = this.innerData;      // typed as AppUser
      return { name: account.username };
    };
  }
}
```

| Property | Type | Description |
|---|---|---|
| `path` | `string` | URL path appended to `baseUrl` |
| `method` | `"get" \| "post" \| "patch" \| "put" \| "delete"` | HTTP method |
| `auth` | `boolean` | Whether the endpoint requires a valid JWT (default: `true`) |
| `requiredPermissions` | `TPermission[]` | Permissions the caller must have |
| `function` | `(req, res) => Promise<T>` | The endpoint handler — the return value is sent as the response body |
| `innerData` | `{ account, auth, request }` | Populated automatically when `auth` is `true` |

The `innerData` object contains:
- `account` — the resolved account (typed as `TAccount`)
- `auth.token` — the raw JWT string
- `auth.data.userId` — the user ID extracted from the token
- `request.ip` — the caller's IP address

**Setting `auth: false`** disables JWT validation and `innerData` will not be populated (accessing it throws an error).

---

### EndpointValidator

Validates the input or output of an endpoint using a [Zod](https://zod.dev) schema or a custom function.

```ts
import { EndpointValidator } from 'propeller-framework';
import { z } from 'zod';

// Validate the request body before the endpoint runs
const bodySchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});

const bodyValidator = new EndpointValidator(
  bodySchema,
  'endpoint-input',   // when to run: 'endpoint-input' | 'endpoint-output'
  'body',             // what to validate: 'body' | 'query' | 'params' | 'headers' | 'other'
  422                 // optional: HTTP status on failure (default: 400)
);
```

Add validators inside `setValidators()`:

```ts
setValidators() {
  this.path = '/user';
  this.method = 'post';
  this.auth = false;
  this.validators = [bodyValidator];

  this.function = async (req, res) => { /* ... */ };
}
```

**Validation targets:**

| Target | Description |
|---|---|
| `body` | `req.body` |
| `query` | `req.query` |
| `params` | `req.params` |
| `headers` | `req.headers` |
| `other` | Custom — passes the whole request to the schema/function (only valid for `endpoint-output`) |

---

### EndpointMiddleware

Transforms the request *before* the endpoint runs (`pre`) or the response data *after* (`post`).

First, define the middleware by extending `EndpointMiddleware`:

```ts
import { EndpointMiddleware } from 'propeller-framework';

interface RawRequest { body: { token: string }; headers: {}; query: {}; params: {} }
interface EnrichedRequest { body: { token: string; decoded: object }; headers: {}; query: {}; params: {} }

export class DecodeTokenMiddleware extends EndpointMiddleware<RawRequest, EnrichedRequest> {
  constructor() {
    super();
    this.function = async (req) => ({
      ...req,
      body: { ...req.body, decoded: decodeToken(req.body.token) },
    });
  }
}
```

Then register it globally with `registerMiddleware`:

```ts
import { registerMiddleware } from 'propeller-framework';
import { DecodeTokenMiddleware } from './middlewares/DecodeToken';

const instance = new DecodeTokenMiddleware();
registerMiddleware('decode-token', instance.function);
```

Finally, attach it to an endpoint:

```ts
setValidators() {
  this.path = '/auth/verify';
  this.method = 'post';
  this.auth = false;
  this.middlewares = [{ identifier: 'decode-token', dest: 'pre' }];
  // ...
}
```

---

### InternalAPIError

Throw this inside any endpoint to return a structured error response.

```ts
import { InternalAPIError } from 'propeller-framework';

// Sent to the client as: { message: 'Not found' } with HTTP 404
throw new InternalAPIError('Not found', 404);

// Optional third argument: a message written only to the server log, not exposed to the client
throw new InternalAPIError('Not found', 404, 'User #42 not found in DB');
```

---

### Router

`initRouting` scans a directory recursively, imports every `.js` / `.ts` file it finds, instantiates the default export (which must be an `Endpoint` subclass), and registers it on the Express router.

```ts
import express from 'express';
import { initRouting } from 'propeller-framework';

const app = express();
const router = express.Router();

// Scans ./routes and registers every endpoint it finds
await initRouting('./routes', router);

app.use(router);
app.listen(3000);
```

On startup Propeller prints a table in the console showing every registered endpoint, its method, URL, auth status, and the number of middlewares and validators loaded.

Each file in the routes directory must export an `Endpoint` subclass as its **first named export**:

```
routes/
  user/
    GetProfile.ts     ← exports GetProfileEndpoint
    CreateUser.ts     ← exports CreateUserEndpoint
  posts/
    ListPosts.ts      ← exports ListPostsEndpoint
```

---

## Services

### AuthService

Handles JWT generation, decoding and validation. Uses the `JWT_SECRET` environment variable.

```ts
import { AuthService } from 'propeller-framework';

// Authenticate a user — compares the plain-text password against the bcrypt hash in user.Password
const result = await AuthService.authenticate(user, plainTextPassword);
// result: { token: string, success: boolean }

// Generate a JWT for a given userId
const jwt = AuthService.generate({ userId: 42 });
// jwt: { token: string, data: { userId: 42 } }

// Decode a JWT and return its payload (does not throw on invalid tokens)
const decoded = AuthService.getDataByToken('Bearer eyJ...');
// decoded: { token: string, data: { userId: number } } | null

// Verify a JWT signature (returns boolean)
const valid = AuthService.validate('Bearer eyJ...');
```

`authenticate()` expects the account object to have `id` and `Password` fields. The password must be bcrypt-hashed in the database.

---

### PropellerLogger

A simple timestamped logger that prefixes every message with the app name set in `configure()`.

```ts
import { PropellerLogger } from 'propeller-framework';

PropellerLogger.info('Server started');
// [14:32:05:123][MyApp][INFO] Server started

PropellerLogger.debug({ userId: 42, action: 'login' });
// [14:32:05:124][MyApp][DEBUG] {"userId":42,"action":"login"}

PropellerLogger.error('Database connection failed');
// [14:32:05:125][MyApp][ERROR] Database connection failed
```

---

### PermissionsService

Checks whether a set of given permissions satisfies a set of required permissions. Called automatically inside the endpoint flow — you generally don't need to call it directly.

```ts
import { PermissionsService } from 'propeller-framework';

PermissionsService.validate(['admin', 'moderator'], ['admin']);  // true
PermissionsService.validate(['read-only'], ['admin']);           // false
```

---

## Database utilities

### createDataSource

Creates a TypeORM `DataSource` pre-configured from environment variables. Pass your own entities, subscribers and any options you want to override.

```ts
import { createDataSource } from 'propeller-framework';
import { User } from './entities/User';
import { Post } from './entities/Post';
import { UserSubscriber } from './subscribers/UserSubscriber';

export const AppDataSource = createDataSource({
  entities: [User, Post],
  subscribers: [UserSubscriber],
  synchronize: true,
});
```

Reads the following environment variables as defaults (all overridable):

| Variable | Used as |
|---|---|
| `DB_HOST` | database host |
| `DB_PORT` | database port |
| `DB_USER` | username |
| `DB_PASSWORD` | password |
| `DB_DATABASE` | database name |

### dbInit

Initializes a `DataSource` and logs the result.

```ts
import { dbInit } from 'propeller-framework';
import { AppDataSource } from './data-source';

await dbInit(AppDataSource);
// [14:32:05:001][MyApp][INFO] Successfully connected to DB
```

---

## Environment variables

Propeller reads configuration from a `.env` file via `dotenv`. Create a `.env` file in your project root:

```env
# Server
SERVER_PORT=3000

# Database (used by createDataSource)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=secret
DB_DATABASE=myapp

# JWT (used by AuthService)
JWT_SECRET=your-secret-key
JWT_SALT=10

# App
APP_NAME=MyApp
ROUTING_PATH=./routes
```

You can access them directly via the `Environment` singleton:

```ts
import { Environment } from 'propeller-framework';

const env = Environment.getInstance();
console.log(env.server.port);       // 3000
console.log(env.config.jwt.secret); // 'your-secret-key'
console.log(env.app.name);          // 'MyApp'
```

---

## Full example

**`src/main.ts`**

```ts
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import { configure, initRouting, dbInit, createDataSource } from 'propeller-framework';
import { User } from './entities/User';

export const AppDataSource = createDataSource({ entities: [User] });

const permissions = ['admin', 'moderator', 'read-only'] as const;
export type AppPermissions = typeof permissions[number];
export type AppUser = User;

configure({
  appName: 'MyApp',
  baseUrl: '/api/v1',
  permissions,
  accountResolver: (userId) =>
    AppDataSource.getRepository(User).findOne({ where: { id: userId } }),
  permissionsResolver: (user) => user.permissions,
});

const app = express();
const router = express.Router();

app.use(cors());
app.use(express.json());

await dbInit(AppDataSource);
await initRouting('./routes', router);

app.use(router);
app.listen(3000);
```

**`src/routes/auth/Login.ts`**

```ts
import { Endpoint, AuthService, InternalAPIError, EndpointValidator } from 'propeller-framework';
import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../../main';
import { User } from '../../entities/User';

const bodySchema = z.object({
  username: z.string(),
  password: z.string(),
});

export class LoginEndpoint extends Endpoint<Request, Response, { token: string }> {
  setValidators() {
    this.path = '/auth/login';
    this.method = 'post';
    this.auth = false;
    this.validators = [new EndpointValidator(bodySchema, 'endpoint-input', 'body', 422)];

    this.function = async (req, res) => {
      const { username, password } = req.body;

      const user = await AppDataSource.getRepository(User).findOne({ where: { username } });
      if (!user) throw new InternalAPIError('Invalid credentials', 401);

      const result = await AuthService.authenticate(user, password);
      if (!result.success) throw new InternalAPIError('Invalid credentials', 401);

      return { token: result.token };
    };
  }
}
```

**`src/routes/user/GetProfile.ts`**

```ts
import { Endpoint, InternalAPIError } from 'propeller-framework';
import { Request, Response } from 'express';
import { AppUser, AppPermissions } from '../../main';

export class GetProfileEndpoint extends Endpoint<Request, Response, { id: number; username: string }, AppUser, AppPermissions> {
  setValidators() {
    this.path = '/user/profile';
    this.method = 'get';
    this.auth = true;
    this.requiredPermissions = ['read-only'];

    this.function = async (req, res) => {
      const { account } = this.innerData;
      return { id: account.id, username: account.username };
    };
  }
}
```
