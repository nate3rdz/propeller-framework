# Propeller Framework

Propeller is a TypeScript framework built on top of Express. Every HTTP endpoint is a **class** that declares its own route, authentication, permissions, validators and middlewares, and implements a single `handler()`. Propeller scans a routes directory, wires every endpoint into an Express app, and handles JWT authentication, account resolution, permission checks and an optional TypeORM database.

> **Status:** pre-1.0, under active development. Read [Known issues](#known-issues) before using it in production.

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [How a request flows](#how-a-request-flows)
- [Configuration](#configuration)
  - [PropellerConfig](#propellerconfig)
  - [Environment variables](#environment-variables)
- [Endpoints](#endpoints)
  - [Defining an endpoint](#defining-an-endpoint)
  - [Generics](#generics)
  - [Properties](#properties)
  - [Request data](#request-data)
  - [innerData](#innerdata)
  - [Return value](#return-value)
  - [Route discovery](#route-discovery)
- [Validators](#validators)
- [Middlewares](#middlewares)
- [Errors](#errors)
- [Services](#services)
  - [AuthService](#authservice)
  - [PermissionsService](#permissionsservice)
  - [PropellerLogger](#propellerlogger)
- [Database](#database)
- [Exports](#exports)
- [Known issues](#known-issues)
- [Development](#development)

---

## Installation

```bash
npm install propeller-framework
```

Propeller ships Express, TypeORM, bcrypt, jsonwebtoken, Zod and the other runtime dependencies. You also need TypeScript tooling and, if you use TypeORM entities, `reflect-metadata` plus the driver for your database (e.g. `mysql2`, `pg`, `sqlite3`):

```bash
npm install -D typescript @types/node
npm install reflect-metadata mysql2
```

Propeller is published as an **ES module**. Your project must use `"type": "module"`, and decorators must be enabled:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "dist"
  }
}
```

---

## Quick start

1. Create a `.env` file in the project root (see [Environment variables](#environment-variables)).
2. Write your endpoints in `src/routes/`.
3. Compile, then point `ROUTING_PATH` at the **compiled** routes directory (Propeller only loads `.js` files, see [Route discovery](#route-discovery)).
4. Call `init()`.

```env
# .env
SERVER_PORT=3000
JWT_SECRET=a-long-random-secret
ROUTING_PATH=./dist/routes
```

```ts
// src/index.ts
import 'reflect-metadata';
import { init, getDataSource } from 'propeller-framework';
import User from './entities/User.js';

await init({
  permissions: ['admin', 'viewer'] as const,
  entities: [User],
  accountResolver: (userId) =>
    getDataSource().getRepository(User).findOne({ where: { id: userId } }),
  permissionsResolver: (user) => user.roles,
});
```

```ts
// src/routes/health.ts
import { Endpoint } from 'propeller-framework';

export class HealthEndpoint extends Endpoint {
  setValidators() {
    this.path = '/health';
    this.method = 'get';
    this.auth = false;
  }

  async handler() {
    return { body: { status: 'ok' }, headers: {} };
  }
}
```

```bash
npx tsc && node dist/index.js
# GET http://localhost:3000/api/v1/health → { "status": "ok" }
```

`init()` loads the environment, initializes the database (only if `entities` is passed), registers every endpoint, **starts listening** on `SERVER_PORT` and returns the Express app. At startup it prints a table with method, URL, auth flag, middleware count and validator count for every endpoint.

---

## How a request flows

For each endpoint, Propeller registers this chain on the Express router:

1. **Input validators** (`endpoint-input`).
2. **Auth header check** (only when `auth` is `true`): the `Authorization` header must contain a JWT signed with `JWT_SECRET`, with or without the `Bearer ` prefix. Otherwise → `401`.
3. **Endpoint flow**:
   1. decode the token and call `accountResolver(userId)` to populate `innerData`;
   2. call `permissionsResolver(account)` and check `requiredPermissions` → `403` if not satisfied;
   3. run `pre` middlewares;
   4. run `handler()`;
   5. run `post` middlewares;
   6. send `output.body` as the response.

Any `InternalAPIError` thrown in the flow is turned into `{ message }` with its status code; any other error becomes a `500`.

---

## Configuration

Propeller has two configuration layers:

| Layer | Where | What goes there |
|---|---|---|
| `PropellerConfig` | argument of `init()` | application logic: permissions, account and permission resolvers, TypeORM entities |
| Environment | `.env` / `process.env` | infrastructure: port, secrets, database, routing, HTTP options |

### PropellerConfig

All fields are optional.

| Field | Type | Description |
|---|---|---|
| `permissions` | `readonly TPermission[]` | Permission strings used by the app. Pass with `as const` to get a literal union type. |
| `accountResolver` | `(userId: number) => Promise<TAccount \| null>` | Loads the account for the `userId` in the JWT. Called on every authenticated request. **Required** if any endpoint has `auth: true`. |
| `permissionsResolver` | `(account: TAccount) => TPermission[]` | Returns the permissions held by the account. Called only for authenticated requests. If omitted, the account has no permissions. |
| `entities` | `DataSourceOptions['entities']` | TypeORM entities. When set, Propeller creates the `DataSource` from the `DB_*` variables and initializes it. |
| `subscribers` | `DataSourceOptions['subscribers']` | TypeORM subscribers. Used only together with `entities`. |

A reusable typing pattern:

```ts
// src/types.ts
export const permissions = ['admin', 'viewer'] as const;
export type AppPermission = typeof permissions[number];
export type AppAccount = User;
```

### Environment variables

`.env` is loaded through `dotenv` when Propeller is imported. Values are read **once**, the first time `Environment.getInstance()` is called.

**Server**

| Variable | Default | Description |
|---|---|---|
| `SERVER_PORT` | — | Port the server listens on. **Required.** |

**JWT**

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | — | Secret used to sign and verify tokens. **Required** (see [Known issues](#known-issues)). |
| `JWT_DEFAULT_TOKEN_EXP_TIME` | `3600000` | Token lifetime in milliseconds, stored in the payload as `metadata.expiresAt`. |
| `JWT_SALT` | — | Currently not used for hashing. |

**Routing**

| Variable | Default | Description |
|---|---|---|
| `ROUTING_PATH` | `./routes` | Directory scanned recursively for endpoint files (`.js` only). Relative to the process working directory. |
| `ROUTING_BASE_URL` | `/api/v1` | Prefix added to every endpoint path. |

**HTTP**

| Variable | Default | Description |
|---|---|---|
| `MAX_ALLOWED_JSON_SIZE` | `5mb` | Body size limit for `express.json` (and `express.urlencoded`). |
| `ALLOW_URL_ENCODED_BODIES` | `false` | Enables `express.urlencoded`. |
| `VERBOSE_MODE` | `false` | Enables `morgan('dev')` request logging. |

CORS is always enabled with default `cors()` options.

**Database** (used when `entities` is passed, or by `createDataSource`)

| Variable | Default | Description |
|---|---|---|
| `DB_TYPE` | `mysql` | Any TypeORM driver. For `sqlite`, `better-sqlite3`, `sqljs` and `capacitor` only `DB_DATABASE` is used. |
| `DB_HOST` | — | Host. |
| `DB_PORT` | — | Port. |
| `DB_USER` | — | Username. |
| `DB_PASSWORD` | — | Password. |
| `DB_DATABASE` | — | Database name, or file path for embedded drivers. |
| `DB_SYNCHRONIZE` | `false` | Sync the schema at startup. **Never enable in production.** |
| `DB_OPTIONS` | — | Read but currently not used. |

**App**

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | `Propeller` | Prefix used by `PropellerLogger`. |

Boolean variables accept `true`/`false`, `yes`/`no`, `1`/`0`.

Values can be read at runtime:

```ts
import { Environment } from 'propeller-framework';

const env = Environment.getInstance();
env.server.port;               // number
env.server.database.type;      // 'mysql'
env.config.jwt.secret;         // string
env.config.routing.baseUrl;    // '/api/v1'
env.app.name;                  // 'Propeller'
```

---

## Endpoints

### Defining an endpoint

Extend `Endpoint`, configure the route in `setValidators()` and implement `handler()`.

```ts
import { Endpoint, InternalAPIError } from 'propeller-framework';
import type { AppAccount, AppPermission } from '../types.js';

type Input = { params: { id: string } };
type Output = { body: { id: number; name: string }; headers: {} };

export class GetUserEndpoint extends Endpoint<AppAccount, AppPermission, Input, Output> {
  setValidators() {
    this.path = '/users/:id';
    this.method = 'get';
    this.auth = true;
    this.requiredPermissions = ['viewer'];
  }

  async handler(): Promise<Output> {
    const id = Number(this.params.id);
    if (Number.isNaN(id)) throw new InternalAPIError('Invalid id', 400);

    return { body: { id, name: this.innerData.account.name }, headers: {} };
  }
}
```

`setValidators()` is called automatically by the `Endpoint` constructor; do not call it again.

### Generics

```ts
Endpoint<TAccount, TPermission, TInput, TOutput>
```

| Generic | Default | Description |
|---|---|---|
| `TAccount` | `any` | Type returned by `accountResolver`; types `innerData.account`. |
| `TPermission` | `never` | Permission union; types `requiredPermissions`. |
| `TInput` | `IPropellerInputContract` | Shape of `{ params, query, body, headers }`; types the request getters. |
| `TOutput` | `IPropellerOutputContract` | Shape of the `handler()` result: `{ body, headers }`. |

### Properties

Set these in `setValidators()`.

| Property | Type | Default | Description |
|---|---|---|---|
| `path` | `string` | — | Express path, appended to `ROUTING_BASE_URL`. Supports params (`/users/:id`). |
| `method` | `'get' \| 'post' \| 'put' \| 'patch' \| 'delete'` | — | HTTP method. |
| `auth` | `boolean` | `true` | Require a valid JWT and resolve the account. |
| `requiredPermissions` | `TPermission[]` | `[]` | All listed permissions are required. |
| `validators` | `IEndpointValidator[]` | `[]` | See [Validators](#validators). |
| `middlewares` | `IEndpointMiddleware[]` | `[]` | See [Middlewares](#middlewares). |

### Request data

Inside `handler()`:

| Getter | Content |
|---|---|
| `this.body` | `req.body` |
| `this.query` | `req.query` |
| `this.params` | `req.params` |
| `this.headers` | `req.headers` |
| `this.originalRequest` | The Express `Request` |

### innerData

Available only when `auth` is `true`; reading it on a public endpoint throws a `500`.

```ts
this.innerData.account          // TAccount returned by accountResolver
this.innerData.auth.token       // raw JWT, without "Bearer "
this.innerData.auth.data        // { userId: number }
this.innerData.auth.metadata    // { expiresAt: number }  (Unix ms)
this.innerData.request.ip       // client IP (socket address)
```

If the token cannot be decoded, `accountResolver` is missing or returns `null`, the request ends with `500 { message: 'Invalid credentials.' }`.

### Return value

`handler()` returns an object matching `IPropellerOutputContract`:

```ts
{ body: any; headers: Record<string, any> }
```

`body` is sent with `res.send()` and status `200`. Return `headers: {}` (see [Known issues](#known-issues)).

### Route discovery

- Propeller walks `ROUTING_PATH` recursively and imports every **`.js`** file. TypeScript sources must be compiled first, and `ROUTING_PATH` must point to the output directory (e.g. `./dist/routes`).
- Each file must export **only** the endpoint class. Propeller instantiates the first export in alphabetical order, so extra exports (types aside) can replace the endpoint.
- A file that fails to import or instantiate is logged and skipped; the server still starts.

---

## Validators

`EndpointValidator` validates a part of the request with a [Zod](https://zod.dev) schema or a predicate function.

```ts
import { Endpoint, EndpointValidator } from 'propeller-framework';
import { z } from 'zod';

const body = z.object({ username: z.string().min(3), password: z.string().min(8) });

export class SignupEndpoint extends Endpoint {
  setValidators() {
    this.path = '/signup';
    this.method = 'post';
    this.auth = false;
    this.validators = [new EndpointValidator(body, 'endpoint-input', 'body')];
  }

  async handler() {
    return { body: { created: true }, headers: {} };
  }
}
```

```ts
new EndpointValidator(schema, dest, target, customStatusNumber?)
```

| Argument | Values |
|---|---|
| `schema` | Zod schema, or `(value) => boolean \| Promise<boolean>` |
| `dest` | `'endpoint-input'` (runs before the endpoint) or `'endpoint-output'` |
| `target` | `'body'`, `'query'`, `'params'`, `'headers'`, or `'other'` (whole request, output only) |
| `customStatusNumber` | Status on failure. Default `400`. |

On failure the response is `{ message: 'Invalid input <target> for this call.' }`. Zod error details are not returned.

---

## Middlewares

Middlewares are functions registered globally by identifier and referenced by endpoints.

```ts
import { registerMiddleware } from 'propeller-framework';

// post middleware: receives the handler output, must return an output
registerMiddleware('add-timestamp', async (output) => ({
  ...output,
  body: { ...output.body, servedAt: Date.now() },
}));
```

```ts
setValidators() {
  this.path = '/time';
  this.method = 'get';
  this.auth = false;
  this.middlewares = [{ identifier: 'add-timestamp', dest: 'post' }];
}
```

| `dest` | Runs | Receives | Returns |
|---|---|---|---|
| `pre` | after auth and permission checks, before `handler()` | the Express `Request` | currently ignored |
| `post` | after `handler()` | the current output `{ body, headers }` | the new output |

Middlewares run in the order they are listed. Register them before `init()`. Referencing an unregistered identifier produces a `500` at request time.

The exported `EndpointMiddleware` base class only stores a `function` property; you can pass `new MyMiddleware().function` to `registerMiddleware`.

---

## Errors

Throw `InternalAPIError` anywhere in the endpoint flow:

```ts
import { InternalAPIError } from 'propeller-framework';

throw new InternalAPIError('Not found', 404);
// → 404 { "message": "Not found" }

throw new InternalAPIError('Not found', 404, 'user 42 missing');
// third argument is written to the server log only
```

Any other error becomes `500 { message: error.toString() }`.

---

## Services

### AuthService

```ts
import { AuthService } from 'propeller-framework';

// bcrypt-compare a password with account.Password, then sign a JWT for account.id
const { success, token } = await AuthService.authenticate(account, password);

// sign a JWT: payload + metadata.expiresAt
const jwt = AuthService.generate({ userId: 42 });

// verify and decode; null if invalid
const decoded = AuthService.getDataByToken('Bearer ' + jwt);
// { token, data: { userId }, metadata: { expiresAt } }

// verify signature only
AuthService.validate(jwt); // boolean
```

- `authenticate()` expects an object with `id` and `Password` (bcrypt hash).
- `getDataByToken()` and `validate()` accept tokens with or without `Bearer `.
- Expiry is stored in `metadata.expiresAt`, not in the standard `exp` claim.

### PermissionsService

Used automatically by the endpoint flow.

```ts
PermissionsService.validate(['admin', 'viewer'], ['admin']); // true
PermissionsService.validate(['viewer'], ['admin']);          // false
PermissionsService.validate([], []);                         // true
```

### PropellerLogger

```ts
PropellerLogger.info('Server started');   // [14:5:3:12][MyApp][INFO] Server started
PropellerLogger.debug({ userId: 42 });    // objects are JSON-serialized
PropellerLogger.error('DB unreachable');
```

Timestamps are UTC. All levels write to stdout.

---

## Database

With `entities` in `init()`, the database is handled automatically and exposed through `getDataSource()`. For manual control:

```ts
import { createDataSource, dbInit, getDataSource } from 'propeller-framework';

const ds = createDataSource({ entities: [User] }); // DataSource | null
if (ds) await dbInit(ds);
```

- `createDataSource(options)` builds a `DataSource` from the `DB_*` variables, without initializing it. Any field in `options` overrides the environment. Returns `null` (and logs) if required variables are missing.
- `dbInit(ds)` calls `ds.initialize()` and logs the result.
- `getDataSource()` returns the `DataSource` created by `init()`, or `null`.

---

## Exports

| Export | Kind |
|---|---|
| `init`, `registerMiddleware`, `getDataSource`, `createDataSource`, `dbInit` | functions |
| `Endpoint`, `EndpointValidator`, `EndpointMiddleware`, `InternalAPIError` | classes |
| `AuthService`, `PermissionsService`, `PropellerLogger`, `Environment` | static services / singleton |
| `PropellerConfig`, `IEndpoint`, `EndpointFunction`, `EndpointMethods`, `IEndpointMiddleware`, `IEndpointValidator`, `VALIDATION_TARGETS_TYPE`, `InnerDataI`, `IJWT`, `JWTData`, `IEnv` | types |

---

## Known issues

These are open defects in the current version. Fixes are tracked as separate tasks.

**Security**

- **Shared endpoint state across requests.** Each endpoint is a single instance; request data and `innerData` are stored on it. Concurrent requests can read each other's `body`, `params` and `account`.
- **Token expiry is not enforced.** `metadata.expiresAt` is never checked, so tokens never expire.
- **Missing `JWT_SECRET` is not detected.** Unset variables become the string `"undefined"`, which is then used as signing secret.
- Unhandled errors return `error.toString()` to the client.
- Input validators run **before** the auth check, and in reverse order of declaration.
- Several dependencies have known advisories (`npm audit`), including `jsonwebtoken` 8.x.

**Behavior**

- `customStatusNumber` on validators is ignored: failures always return `400`.
- `endpoint-output` validators never run.
- The return value of `pre` middlewares is discarded.
- `headers` returned by `handler()` are set after the body is sent: they never reach the client, and non-empty headers raise an unhandled `ERR_HTTP_HEADERS_SENT` on the server.
- Response status is always `200`.
- Auth failures inside the endpoint flow (unknown account, missing resolver) return `500` instead of `401`/`404`.
- `dbInit()` retries a failed connection in a tight loop without waiting and without being awaited.
- Only compiled `.js` route files are loaded.

**Unfinished**

- `scripts/create-template.js` (project scaffolding CLI) has no implementation.
- The project templates in `templates/` use an older endpoint API.
- No automated tests.

---

## Development

```bash
npm install
npm run build        # type declarations (tsc) + ESM bundle (esbuild) → dist/
npm run build:dev    # build, pack and install into ./test for local testing
npx tsc --noEmit     # type-check
npx tslint -c tslint.json -p tsconfig.json
```

### Branch model

| Branch | Purpose |
|---|---|
| `main` | Original line of development. |
| `agentic-main` | Stable line maintained through the agent workflow. Updated only from `agentic-staging` via reviewed PR. |
| `agentic-staging` | Integration branch for completed tasks. |
| `agentic-<task>` | One branch per task, created from `agentic-staging`, merged back via reviewed PR. |

Rules for automated agents working on this repository are in [`CLAUDE.md`](./CLAUDE.md).
