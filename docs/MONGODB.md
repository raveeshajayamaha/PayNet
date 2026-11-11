# MongoDB setup and integration

## What changed

The initial workspace had no PostgreSQL dependency, SQL queries or schema.
There was consequently no SQL implementation to remove and no local PostgreSQL
data to migrate. Task 04 now adds authentication, wallets, atomic virtual payments,
persisted notifications and connected frontend pages; see [backend/README.md](../backend/README.md).
Historical networking reports describe the earlier project snapshot. A separate PostgreSQL deployment, if one exists
outside this workspace, would require its own reviewed data migration.

The existing React pages, layouts, images, styles and animations remain in use.
Their service interfaces now call the backend; explicit sample mode remains available.
Existing networking diagnostics are preserved alongside authenticated financial sockets.

New backend files:

- `config/database.js`: environment validation, connection lifecycle, collection/index initialization and bounded readiness checks.
- `models/User.js`, `Wallet.js`, `Transaction.js`, `Notification.js`, `Session.js`: Mongoose schemas and indexes.
- `services/databaseTransaction.js`: reusable MongoDB session/transaction boundary.
- `utils/money.js`: exact conversion between decimal LKR text and integer cents.
- `scripts/check-database.js`: connection/index verification without starting HTTP.

## Install MongoDB on Windows

Use Node.js 24 (the version used for verification) and npm. The backend requires
Node.js 20.19 or newer; use a Node version also supported by the frontend's Vite.

1. Download the Community Server MSI using the [official Windows installation guide](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-windows/).
2. Install MongoDB Server. For the fresh local development setup below, leave
   **Install MongoDB as a Service** unchecked and run `mongod` in a terminal.
   An existing service can remain running if you use a different port for this instance.
3. Install [MongoDB Shell (`mongosh`)](https://www.mongodb.com/try/download/shell)
   separately. Compass is optional; it does not replace the database server.
4. Add the installed Server `bin` directory and `mongosh` directory to PATH,
   or invoke their full executable paths. Verify with `mongod --version` and
   `mongosh --version` in a new PowerShell terminal.

## Start a local replica set

Multi-document transactions require a replica set or sharded cluster. A plain
standalone `mongod` supports the connection and models, but the transaction helper
will refuse to execute its callback. For development, one replica-set member is
sufficient. It does not provide production redundancy.

In PowerShell, from the project root:

```powershell
New-Item -ItemType Directory -Force -Path .mongodb-data
mongod --dbpath "$PWD\.mongodb-data" --replSet rs0 --bind_ip localhost --port 27017
```

Keep that terminal running. If another MongoDB service owns port 27017, use
27018 consistently in the command, initialization, connection string and `.env`.
The local data directory is ignored by Git.

In a second terminal, open the MongoDB shell:

```powershell
mongosh "mongodb://localhost:27017"
```

At the `mongosh` prompt, initialize this new replica set **once**:

```javascript
rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] })
db.hello().isWritablePrimary
```

Repeat the second command until it returns `true`. Do not rerun initialization on an
already initialized set. After a restart, reuse the same data directory and
`--replSet rs0`; initialization is persisted.

For an existing standalone server with data, back it up, shut it down cleanly,
add this to its `mongod.cfg`, restart it with the same data directory, and initialize
the set as described in [MongoDB's conversion guide](https://www.mongodb.com/docs/manual/tutorial/convert-standalone-to-replica-set/):

```yaml
replication:
  replSetName: rs0
```

The commands above bind an unauthenticated development database to localhost.
For production, use Atlas or deploy a secured multi-member replica set with
authentication, TLS, backups and access restrictions.

## Use MongoDB Atlas instead

Atlas hosts the database, so no local `mongod`, service, data directory or
`rs.initiate()` is required.

1. Create an Atlas project and cluster.
2. Create a **database user** with `readWrite` access to the `paynet` database
   (this is separate from your Atlas website account).
3. Add the backend machine's current public IP to the project's IP access list.
4. Choose **Connect → Drivers → Node.js** and copy the connection string.
5. Substitute the database username/password and include `/paynet` before `?`:

```dotenv
MONGODB_URI=mongodb+srv://<username>:<encoded-password>@<cluster-host>/paynet?retryWrites=true&w=majority
```

Percent-encode reserved characters in credentials. Keep the URI only in the backend
environment; never put it in `VITE_*` variables. Atlas supplies the replica-set or
sharded deployment needed for transactions; no manual replica-set initialization
is needed. See the [official Atlas connection instructions](https://www.mongodb.com/docs/atlas/driver-connection/).

## Configure and connect PayNet

From the project root:

```powershell
Set-Location backend
npm.cmd ci
Copy-Item .env.example .env
```

If `.env` already exists, edit its database entries instead of overwriting other
settings. Set these values for the local replica set:

```dotenv
PORT=5000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
JWT_SECRET=<paste-your-own-random-secret-of-at-least-32-bytes>
JWT_EXPIRES_IN=1h
DEMO_FUNDING_ENABLED=false
MONGODB_URI=mongodb://localhost:27017/paynet?replicaSet=rs0
MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000
SOCKET_ALLOWED_ORIGINS=http://localhost:5173
```

For Atlas, substitute its URI. `.env` is loaded relative to `backend/`, regardless
of the shell's current directory, and is ignored by Git. Existing process environment
variables take precedence over `.env`.

```powershell
npm.cmd run db:check
npm.cmd start
```

Startup attempts to connect to MongoDB, creates the collections, awaits required indexes,
and verifies connectivity. API liveness remains available even if the database fails.
Database-dependent routes require successful initialization. Index creation is
additive (`createIndexes`), with no dropping of collections, indexes or records.
Conflicting indexes or existing duplicates cause initialization to fail; resolve
the data/index conflict explicitly before restarting. Startup does not silently
discard records or bypass uniqueness. The database user needs collection/index
creation privileges, included in `readWrite` for this database.

With `MONGODB_URI` unset, development/test startup preserves the existing UI/network
demo and reports MongoDB as unavailable. A configured but unreachable URI leaves
database routes unavailable and is retried every ten seconds. Production and other environments require the URI. Shutdown closes
Socket.IO, HTTP and the database connection. No URI or raw driver error is logged.

In another terminal, start the existing frontend as before:

```powershell
Set-Location frontend
npm.cmd run dev
```

Do not put database credentials in frontend environment variables. Use
`VITE_DEMO_MODE=false` for actual virtual accounts and connected services;
`VITE_DEMO_MODE=true` retains the original fictional UI preview.

## Verify the connection

With the backend running, use PowerShell:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
Invoke-RestMethod http://localhost:5000/api/db-health | ConvertTo-Json -Depth 4
```

`/api/health` remains HTTP 200 with `success: true` and
`message: "PayNet API is running"` for the existing frontend panel. Its additional
`database` field is a cheap connection/initialization summary. This is API liveness,
not proof that the database or payment system is operational.

`/api/db-health` (also `/api/health/database`) performs a real `ping` and `hello`, each bounded to two seconds.
It returns HTTP 503 if disconnected, uninitialized or unreachable. A healthy
replica set/Atlas response is:

```json
{
  "success": true,
  "database": {
    "provider": "mongodb",
    "status": "connected",
    "initialized": true,
    "ready": true,
    "transactionsSupported": true
  }
}
```

A healthy standalone connection returns HTTP 200 with `transactionsSupported: false`.
Payment mutations require **both** `ready` and `transactionsSupported`.
Topology detection is a capability check; the integration tests additionally
exercise actual commit and rollback. No health request writes test payments.

`npm.cmd run db:check` performs the same startup/index and database checks, prints
the database status, and disconnects. It exits nonzero on failure. Check server
availability, replica-set initialization/name, Atlas IP access, URI credentials,
database privileges and unique-index conflicts if it fails.

## Models and money representation

| Model | Fields and constraints |
| --- | --- |
| User | `fullName`, normalized unique `email`, `passwordHash`, server-controlled `role`, `isActive`, authentication version and timestamps. Password hashes are never returned by the API. |
| Wallet | Unique `userId`, integer `balanceCents`, `currency=LKR`, lifetime demo-funding usage and timestamps. One wallet per user. |
| Transaction | Wallet references, positive `amountCents`, `currency`, `type`, uppercase `status` (`PENDING`, `COMPLETED`, `FAILED`), unique `referenceNumber`, user-scoped unique `idempotencyKey`, request fingerprint, description, timestamps and `completedAt`. Sender/receiver may be absent for funding or a failed unavailable-recipient attempt. |
| Notification | Owner, title/message/type, read marker, transaction reference and timestamps. Owner/date and owner/unread indexes; unique notification per transaction/outcome/owner. |
| Session | User, hashed JWT, expiry and timestamps. Expiry TTL index; every request also checks expiry explicitly. |

`balanceCents` and `amountCents` are **integer cents**, never rupee decimal amounts:
LKR 10.50 is stored as `1050`. Mongoose validates safe integer bounds and rejects
fractions, nonfinite numbers, implicit string/boolean coercion and invalid signs. The supported range is 0 through
`Number.MAX_SAFE_INTEGER` cents; transaction amounts must be at least one cent.
MongoDB numeric storage represents every integer in this range exactly.

Use `parseLkrToCents('0.29')` to obtain `29`, and `formatLkrCents(29)` to obtain
`'0.29'`. Parsing uses `BigInt` internally and rejects excess precision or overflow;
never use `parseFloat(text) * 100`. Validate bounds after any future arithmetic.
The frontend's demo data are unchanged. Connected requests use integer cents,
monetary totals are formatted with BigInt, and conversion to floating-point rupees
is restricted to chart visualization. See the backend README for operating limits.

## Transaction architecture

`withDatabaseTransaction(async (session, models) => { ... })` uses the configured
connection's Mongoose `connection.transaction()`, which wraps MongoDB
`session.withTransaction()`. It verifies readiness and replica-set/sharded capability,
uses primary reads, snapshot isolation and majority write concern, commits on success,
aborts on error, handles transient retries and ends the session. Mongoose also
restores document change tracking after rollback.

The registration, password-change, funding and payment services now invoke this
helper. The following rules are implemented and apply to future extensions:

- Pass `{ session }` to **every** query/write and use models from that connection.
- Await operations sequentially; no `Promise.all` or nested transactions in a session.
- Preserve authorization, currency checks, positive integer validation, conditional
  debit with sufficient funds, bounded credit and transaction recording. Throw on
  any failure so all writes roll back. ObjectId refs are not foreign-key constraints.
- Query updates need explicit validation. Mongoose update validators do not protect
  `$inc` arithmetic; conditional updates guard both underflow and overflow.
- Keep stable server-controlled references and user-scoped idempotency keys. The
  payment service also verifies a normalized request fingerprint before replaying.
- The callback may be retried. Keep external side effects outside it. Emit existing
  Socket.IO payment notifications only after the returned promise commits, ideally
  using a durable outbox committed with the future payment.

See [Mongoose transactions](https://mongoosejs.com/docs/transactions.html) and
[MongoDB Node.js transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

## Tests

```powershell
Set-Location backend
npm.cmd test
npm.cmd run test:database
npm.cmd run test:api
npm.cmd run lint
```

The default test suite retains all network/security tests and adds money, model,
configuration, readiness, startup and shutdown checks without needing MongoDB.
`test:database` starts isolated real MongoDB processes (a single-member replica set
and a standalone) on ephemeral ports, and checks unique indexes, timestamps, hash
selection, committed records, rollback, duplicate-key aborts, session cleanup, the connection-check CLI, HTTP
readiness and outage behavior. It never uses the application's `.env` URI or writes
to an existing database, and shuts down its processes afterwards.

The development-only `mongodb-memory-server-core` package downloads an official
MongoDB binary on the first integration run and caches it under ignored
`backend/.mongodb-binaries/`. This requires network access and disk space. Set
`MONGOMS_SYSTEM_BINARY` to an existing `mongod` path to avoid downloading, or use
`MONGOMS_VERSION` for an appropriate supported server version. There is no binary
download during normal dependency installation.

Frontend regression commands (browser suites start their own isolated servers):

```powershell
Set-Location frontend
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run build
npm.cmd test
npm.cmd run test:live
```

The existing browser configuration uses Windows Edge. Select an installed browser
in `playwright.config.js` if running on another operating system.

Verified on 2026-11-11 with Node.js 24.13.0, Mongoose 9.12.1 and MongoDB 8.2.6:
The current test inventory and verification results are recorded in
[backend/README.md](../backend/README.md). The frontend source now integrates live
APIs while retaining the existing design, public assets, animations and routing.

## Upgrade an earlier foundation database

If a previous version stored integer-cent `balance` and `amount` fields, stop all
application writers, back up the database, and run `npm.cmd run db:migrate` from
`backend/`. This explicitly migrates to `balanceCents`/`amountCents` and uppercase
statuses in a transaction, without rescaling values. Unsafe or conflicting values
abort migration. Startup refuses legacy monetary fields so they cannot silently
be read as zero. Restart the API and run `npm.cmd run db:check` afterwards.
