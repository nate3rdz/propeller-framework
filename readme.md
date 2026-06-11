# Propeller Framework

Propeller is a TypeScript framework built on top of Express that lets you write HTTP endpoints as **classes**, keeping auth, validation, middleware and business logic cleanly separated and strongly typed.

Instead of writing loose route handlers, you define each endpoint as a class that declares its own path, method, auth requirements, validators and middlewares. Propeller takes care of the execution flow.

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration reference](#configuration-reference)
  - [PropellerConfig (programmatic)](#propellerconfig-programmatic)
  - [Environment variables](#environment-variables)
- [Core concepts](#core-concepts)
  - [Endpoint](#endpoint)
  - [EndpointValidator](#endpointvalidator)
  - [EndpointMiddleware](#endpointmiddleware)
  - [InternalAPIError](#internalapierror)
- [Services](#services)
  - [AuthService](#authservice)
  - [PropellerLogger](#propellerlogger)
  - [PermissionsService](#permissionsservice)
- [Database utilities](#database-utilities)
- [Full example](#full-example)

---

## Installation

```bash
npm install propeller-framework
```

Propeller bundles all its runtime dependencies (Express, TypeORM, bcrypt, JWT, Zod, etc.) — no separate installs needed.

The only additional packages required are standard TypeScript tooling:

```bash
npm install -D @types/node typescript
```

Your `tsconfig.json` must have decorators enabled:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

---

## Quick start

1. Create a `.env` file in your project root (see [Environment variables](#environment-variables)).
2. Create a `routes/` directory and add your first endpoint file (or name it as you wish through `ROUTING_PATH` env variable).
3. Call `init()` — Propeller creates the Express app internally, registers all routes, initializes the database (if `entities` is provided in configuration), and starts listening.

```ts
// src/main.ts
import 'reflect-metadata';
import { init, getDataSource } from 'propeller-framework';
import { User } from './entities/User';

const app = await init({
  permissions: ['admin', 'moderator', 'viewer'] as const,
  entities: [User],

  accountResolver: async (userId) =>
    getDataSource().getRepository(User).findOne({ where: { id: userId } }),

  permissionsResolver: (user) => user.roles,
});
```

Propeller prints a startup table with every registered endpoint, its method, full URL, auth status, middleware count, and validator count.

---

## Configuration reference

Propeller has two separate configuration layers:

| Layer | How | What belongs here |
|---|---|---|
| `PropellerConfig` | passed to `init()` | account/permission logic, entities, typed to your app |
| `.env` variables | read from `.env` at startup | infrastructure — ports, secrets, DB credentials, feature flags |

### PropellerConfig (programmatic)

Passed as the optional argument to `init()`. All fields are optional.

```ts
import { init, type PropellerConfig } from 'propeller-framework';

const app = await init({
  permissions,         // your app's permission list (use `as const` for full autocomplete)
  entities,            // TypeORM entities — Propeller creates and initializes the DataSource
  subscribers,         // TypeORM subscribers (optional, only relevant when entities is set)
  accountResolver,     // how to load an account by userId
  permissionsResolver, // how to extract permissions from an account
});
```

| Field | Type | Description |
|---|---|---|
| `permissions` | `readonly TPermission[]` | List of valid permission strings for your app. Pass with `as const` to get autocomplete on `requiredPermissions` inside endpoints. |
| `entities` | `DataSourceOptions['entities']` | TypeORM entity classes to register. When provided, Propeller automatically creates the `DataSource` (using DB env vars) and initializes it. After `init()` resolves, `getDataSource()` returns the live `DataSource`. |
| `subscribers` | `DataSourceOptions['subscribers']` | TypeORM subscriber classes to register alongside `entities`. Ignored if `entities` is not set. |
| `accountResolver` | `(userId: number) => Promise<TAccount \| null>` | Called on every authenticated request. Receives the `userId` extracted from the JWT and must return the account object or `null`. If `null` is returned Propeller replies with `404`. **Required** when any endpoint uses `auth: true`. |
| `permissionsResolver` | `(account: TAccount) => TPermission[]` | Called after `accountResolver`. Must return the list of permission strings held by the account. Only invoked when `auth: true` **and** the account is non-null. |

**Accessing the DataSource after init:**

When you pass `entities`, Propeller stores the initialized `DataSource` internally. Retrieve it anywhere in your code — including inside `accountResolver` — with `getDataSource()`:

```ts
import { init, getDataSource } from 'propeller-framework';
import { User } from './entities/User';

const app = await init({
  entities: [User],
  accountResolver: async (userId) =>
    // getDataSource() is safe here because accountResolver is called lazily (per-request),
    // by which time init() has already completed and the DataSource is live.
    getDataSource().getRepository(User).findOne({ where: { id: userId } }),
});
```

**Typing pattern** — define your types once in a shared file and import them in every endpoint:

```ts
// src/config.ts
const permissions = ['admin', 'moderator', 'viewer'] as const;
export type AppPermissions = typeof permissions[number];
export type AppUser = User;
```

---

### Environment variables

Create a `.env` file in your project root. Propeller loads it automatically at startup via `dotenv`.

#### Server

| Variable | Type | Default | Description |
|---|---|---|---|
| `SERVER_PORT` | `number` | — | Port the Express server listens on. **Required.** |

#### Database (used when `entities` is provided, or when calling `createDataSource` manually)

| Variable | Type | Default | Description |
|---|---|---|---|
| `DB_TYPE` | `string` | `mysql` | Database driver. Any TypeORM-supported value: `mysql`, `postgres`, `sqlite`, `better-sqlite3`, `mssql`, etc. For embedded drivers (sqlite, better-sqlite3, sqljs) only `DB_DATABASE` is required — host/port/user/password are ignored. |
| `DB_HOST` | `string` | — | Database host. Not used for embedded drivers. |
| `DB_PORT` | `number` | — | Database port. Not used for embedded drivers. |
| `DB_USER` | `string` | — | Database username. Not used for embedded drivers. |
| `DB_PASSWORD` | `string` | — | Database password. Not used for embedded drivers. |
| `DB_DATABASE` | `string` | — | Database name or file path (e.g. `./data.db` for SQLite). |
| `DB_OPTIONS` | `string` | — | Extra connection string options (driver-specific). |
| `DB_SYNCHRONIZE` | `boolean` | `false` | If `true`, TypeORM syncs the schema on every startup. **Never use in production.** Accepted values: `true`/`false`, `yes`/`no`, `1`/`0`. |

#### JWT (used by `AuthService`)

| Variable | Type | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | `string` | — | Secret used to sign and verify tokens. **Required** if any endpoint uses `auth: true`. |
| `JWT_SALT` | `string` | — | bcrypt salt rounds used inside `AuthService.authenticate`. |
| `JWT_DEFAULT_TOKEN_EXP_TIME` | `number` | `3600000` (1 h) | Token lifetime in **milliseconds**, embedded in the JWT payload as `metadata.expiresAt`. |

#### Routing

| Variable | Type | Default | Description |
|---|---|---|---|
| `ROUTING_PATH` | `string` | `./routes` | Directory Propeller scans recursively for endpoint files. |
| `ROUTING_BASE_URL` | `string` | `/api/v1` | Prefix prepended to every endpoint path (e.g. `/api/v1` + `/user/profile` → `/api/v1/user/profile`). |

#### HTTP / Express

| Variable | Type | Default | Description |
|---|---|---|---|
| `MAX_ALLOWED_JSON_SIZE` | `string` | `5mb` | Maximum body size accepted by `express.json` (and `express.urlencoded` if enabled). Examples: `10mb`, `512kb`. |
| `ALLOW_URL_ENCODED_BODIES` | `boolean` | `false` | If `true`, enables `express.urlencoded` middleware for HTML form submissions. Accepted values: `true`/`false`, `yes`/`no`, `1`/`0`. |
| `VERBOSE_MODE` | `boolean` | `false` | If `true`, enables `morgan("dev")` request logging to stdout. Accepted values: `true`/`false`, `yes`/`no`, `1`/`0`. |

#### App

| Variable | Type | Default | Description |
|---|---|---|---|
| `APP_NAME` | `string` | `Propeller` | App name shown as prefix in every `PropellerLogger` line. |

**Minimal `.env` example:**

```env
SERVER_PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=secret
DB_DATABASE=myapp

JWT_SECRET=your-very-long-random-secret
JWT_SALT=10

APP_NAME=MyApp
```

You can read any value at runtime via the `Environment` singleton:

```ts
import { Environment } from 'propeller-framework';

const env = Environment.getInstance();
env.server.port                         // 3000
env.server.database.type                // 'mysql'
env.server.database.host                // 'localhost'
env.server.database.synchronize         // false
env.config.jwt.secret                   // 'your-very-long-random-secret'
env.config.jwt.defaultTokenExpTime      // 3600000
env.config.routing.baseUrl              // '/api/v1'
env.config.routing.path                 // './routes'
env.config.maxAllowedJsonSize           // '5mb'
env.config.verbose                      // false
env.config.allowUrlEncodedBodies        // false
env.app.name                            // 'MyApp'
```

---

## Core concepts

### Endpoint

The main building block. Extend `Endpoint` and implement `setValidators()` to declare the route.

```ts
import { Endpoint } from 'propeller-framework';
import { Request, Response } from 'express';
import { AppUser, AppPermissions } from '../config';

// Generics: <RequestType, ResponseType, ReturnType, AccountType, PermissionsType>
export class GetProfileEndpoint extends Endpoint<Request, Response, { name: string }, AppUser, AppPermissions> {

  setValidators() {
    this.path = '/user/profile';
    this.method = 'get';
    this.auth = true;
    this.requiredPermissions = ['viewer'];   // autocompletes from AppPermissions

    this.function = async (req, res) => {
      const { account } = this.innerData;   // typed as AppUser
      return { name: account.username };    // return value is sent as the JSON response body
    };
  }
}
```

#### Properties

| Property | Type | Description |
|---|---|---|
| `path` | `string` | URL path appended to `ROUTING_BASE_URL`. |
| `method` | `"get" \| "post" \| "patch" \| "put" \| "delete"` | HTTP method. |
| `auth` | `boolean` | Whether the endpoint requires a valid JWT. Default: `true`. |
| `requiredPermissions` | `TPermission[]` | Permissions the caller must hold. Empty array = authenticated but no specific permission required. |
| `function` | `(req, res) => Promise<T>` | The endpoint handler. Its return value is sent as the JSON response body. |
| `validators` | `IEndpointValidator[]` | Input/output validators (see [EndpointValidator](#endpointvalidator)). |
| `middlewares` | `IEndpointMiddleware[]` | Pre/post middlewares (see [EndpointMiddleware](#endpointmiddleware)). |

#### innerData

When `auth: true`, Propeller populates `this.innerData` before your handler runs:

```ts
this.innerData.account              // resolved account, typed as TAccount
this.innerData.auth.token           // raw JWT string (without "Bearer" prefix)
this.innerData.auth.data            // JWT payload: { userId: number }
this.innerData.auth.metadata        // { expiresAt: number } — Unix timestamp in ms
this.innerData.request.ip           // caller's IP address
```

Accessing `innerData` on an endpoint with `auth: false` throws an `InternalAPIError`.

Each file in the routes directory must export the endpoint class as its **first named export**. Propeller instantiates it automatically while scanning `ROUTING_PATH`.

---

### EndpointValidator

Validates the request input or the endpoint output using a [Zod](https://zod.dev) schema or a custom function.

```ts
import { EndpointValidator } from 'propeller-framework';
import { z } from 'zod';

const bodySchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});

// Validate req.body before the endpoint runs; return 422 on failure
const bodyValidator = new EndpointValidator(
  bodySchema,
  'endpoint-input',   // 'endpoint-input' | 'endpoint-output'
  'body',             // 'body' | 'query' | 'params' | 'headers' | 'other'
  422                 // optional HTTP status on failure (default: 400)
);
```

Attach validators inside `setValidators()`:

```ts
setValidators() {
  this.path = '/user';
  this.method = 'post';
  this.auth = false;
  this.validators = [bodyValidator];
  this.function = async (req, res) => { /* ... */ };
}
```

| Target | What is passed to the schema |
|---|---|
| `body` | `req.body` |
| `query` | `req.query` |
| `params` | `req.params` |
| `headers` | `req.headers` |
| `other` | Full request object (only valid for `endpoint-output`) |

---

### EndpointMiddleware

Transforms the request *before* the endpoint runs (`pre`) or the response data *after* (`post`).

**Step 1** — define your middleware by extending `EndpointMiddleware`:

```ts
import { EndpointMiddleware } from 'propeller-framework';

export class LogRequestMiddleware extends EndpointMiddleware {
  constructor() {
    super();
    this.function = async (req) => {
      console.log(req.method, req.url);
      return req; // must return the (optionally modified) input
    };
  }
}
```

**Step 2** — register it globally with `registerMiddleware`:

```ts
import { registerMiddleware } from 'propeller-framework';
import { LogRequestMiddleware } from './middlewares/LogRequest';

registerMiddleware('log-request', new LogRequestMiddleware().function);
```

**Step 3** — attach it to an endpoint using its identifier:

```ts
setValidators() {
  this.path = '/user';
  this.method = 'get';
  this.auth = true;
  this.middlewares = [
    { identifier: 'log-request', dest: 'pre' },
  ];
  this.function = async (req, res) => { /* ... */ };
}
```

| `dest` | When it runs | Receives | Must return |
|---|---|---|---|
| `pre` | Before `function`, after auth | `req` | Modified (or unchanged) `req` — passed to `function` |
| `post` | After `function` | Return value of `function` | Modified (or unchanged) return value — sent to client |

---

### InternalAPIError

Throw this inside any endpoint to return a structured error response.

```ts
import { InternalAPIError } from 'propeller-framework';

// Sends: { message: 'Not found' } with HTTP 404
throw new InternalAPIError('Not found', 404);

// Third argument: written to the server log only, never exposed to the client
throw new InternalAPIError('Not found', 404, 'User #42 not found in DB');
```

---

## Services

### AuthService

Handles JWT generation, validation and decoding. Reads `JWT_SECRET` and `JWT_SALT` from the environment.

```ts
import { AuthService } from 'propeller-framework';

// Authenticate a user — compares plain-text password against the bcrypt hash in user.Password
const result = await AuthService.authenticate(user, plainTextPassword);
// result: { token: string, success: boolean }
// On success, result.token is the signed JWT string to return to the client.

// Generate a JWT for an arbitrary payload
const token = AuthService.generate({ userId: 42 });
// returns: string

// Decode and validate a JWT
const decoded = AuthService.getDataByToken('Bearer eyJ...');
// returns: { token: string, data: { userId: number }, metadata: { expiresAt: number } } | null
// Returns null for invalid, expired or malformed tokens.

// Check whether a token's signature is valid (synchronous)
const valid = AuthService.validate('Bearer eyJ...');
// returns: boolean
```

**Notes:**
- `authenticate()` expects the account object to have `id` (number or string) and `Password` (bcrypt hash) fields.
- `generate()` embeds `metadata.expiresAt` (Unix ms) in the JWT payload. The expiry is stored as payload data, not as the JWT `exp` claim.
- `getDataByToken()` and `validate()` both accept tokens with or without the `Bearer ` prefix.

---

### PropellerLogger

A timestamped logger that prefixes every line with the app name from `APP_NAME`.

```ts
import { PropellerLogger } from 'propeller-framework';

PropellerLogger.info('Server started');
// [14:32:05:123][MyApp][INFO] Server started

PropellerLogger.debug({ userId: 42, action: 'login' });
// [14:32:05:124][MyApp][DEBUG] {"userId":42,"action":"login"}

PropellerLogger.error('Database connection failed');
// [14:32:05:125][MyApp][ERROR] Database connection failed
```

Accepts a `string` or any `Object` (objects are serialized with `JSON.stringify`).

---

### PermissionsService

Checks whether a set of granted permissions satisfies a set of required permissions. Called automatically inside the endpoint flow — you generally don't need to call this directly.

```ts
import { PermissionsService } from 'propeller-framework';

PermissionsService.validate(['admin', 'moderator'], ['admin']);  // true
PermissionsService.validate(['viewer'], ['admin']);               // false
PermissionsService.validate([], []);                             // true (no requirements)
```

---

## Database utilities

When `entities` is passed to `init()`, Propeller handles the database lifecycle automatically. For advanced use cases you can also manage the `DataSource` manually.

### getDataSource

Returns the `DataSource` created and initialized by `init()`. Returns `null` if `entities` was not passed or if initialization failed.

```ts
import { getDataSource } from 'propeller-framework';

const ds = getDataSource(); // DataSource | null
const user = await ds.getRepository(User).findOne({ where: { id: 1 } });
```

### createDataSource

Creates a TypeORM `DataSource` pre-configured from environment variables without initializing it. Use this if you need full control over when and how the DataSource is set up.

Returns `null` if required DB environment variables are missing — Propeller logs an error.

```ts
import { createDataSource, dbInit } from 'propeller-framework';
import { User } from './entities/User';

const ds = createDataSource({ entities: [User] }); // DataSource | null

if (ds) await dbInit(ds);
```

The following env vars are used as defaults and can all be overridden by the options object:

| Env var | DataSource field |
|---|---|
| `DB_TYPE` | `type` |
| `DB_HOST` | `host` |
| `DB_PORT` | `port` |
| `DB_USER` | `username` |
| `DB_PASSWORD` | `password` |
| `DB_DATABASE` | `database` |
| `DB_SYNCHRONIZE` | `synchronize` |

### dbInit

Initializes a `DataSource` (calls `dataSource.initialize()`) and logs the result.

```ts
import { dbInit } from 'propeller-framework';

await dbInit(dataSource);
// [14:32:05:001][MyApp][INFO] Successfully connected to DB
```

---

## Full example

**Project layout:**

```
src/
  main.ts
  entities/
    User.ts
  routes/
    auth/
      Login.ts
    user/
      GetProfile.ts
.env
```

**`.env`:**

```env
SERVER_PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=secret
DB_DATABASE=myapp
DB_SYNCHRONIZE=true

JWT_SECRET=supersecret
JWT_SALT=10
JWT_DEFAULT_TOKEN_EXP_TIME=3600000

ROUTING_BASE_URL=/api/v1
APP_NAME=MyApp
VERBOSE_MODE=true
```

**`src/main.ts`:**

```ts
import 'reflect-metadata';
import { init, getDataSource } from 'propeller-framework';
import { User } from './entities/User';

const permissions = ['admin', 'moderator', 'viewer'] as const;
export type AppPermissions = typeof permissions[number];
export type AppUser = User;

export const app = await init({
  permissions,
  entities: [User],
  accountResolver: (userId) =>
    getDataSource().getRepository(User).findOne({ where: { id: userId } }),
  permissionsResolver: (user) => user.roles,
});
```

**`src/routes/auth/Login.ts`:**

```ts
import { Endpoint, AuthService, InternalAPIError, EndpointValidator, getDataSource } from 'propeller-framework';
import { Request, Response } from 'express';
import { z } from 'zod';
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

      const user = await getDataSource().getRepository(User).findOne({ where: { username } });
      if (!user) throw new InternalAPIError('Invalid credentials', 401);

      const result = await AuthService.authenticate(user, password);
      if (!result.success) throw new InternalAPIError('Invalid credentials', 401);

      return { token: result.token };
    };
  }
}
```

**`src/routes/user/GetProfile.ts`:**

```ts
import { Endpoint } from 'propeller-framework';
import { Request, Response } from 'express';
import { AppUser, AppPermissions } from '../../main';

export class GetProfileEndpoint extends Endpoint<Request, Response, { id: number; username: string }, AppUser, AppPermissions> {
  setValidators() {
    this.path = '/user/profile';
    this.method = 'get';
    this.auth = true;
    this.requiredPermissions = ['viewer'];

    this.function = async (req, res) => {
      const { account } = this.innerData;
      return { id: account.id, username: account.username };
    };
  }
}
```
