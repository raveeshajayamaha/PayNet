# PayNet backend

JavaScript Express/Mongoose API with bcrypt passwords, revocable JWT cookie sessions,
Zod validation, Helmet, exact CORS/origin checks, CSRF protection, rate limiting and
Socket.IO. This university prototype operates on virtual funds only.

## Installation and environment

Use Node.js 24. From `backend/`, run `npm.cmd ci`, copy `.env.example` to `.env`
(edit rather than overwrite an existing file), and configure:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Local replica-set or Atlas connection string, including the database name. |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | Connection timeout, default 5000; 100–60000. |
| `PORT` | HTTP and Socket.IO port, default 5000. |
| `FRONTEND_URL` | Exact frontend origin, default `http://localhost:5173`; HTTPS in production. |
| `SOCKET_ALLOWED_ORIGINS` | Explicit comma-separated diagnostic/socket origins; set to the frontend origin. |
| `JWT_SECRET` | Private random secret of at least 32 bytes. Never put in frontend variables. |
| `JWT_EXPIRES_IN` | Session duration such as `1h`; 60 seconds through 7 days. |
| `NODE_ENV` | `development`, `test` or `production`; use `production` for deployment. |
| `DEMO_FUNDING_ENABLED` | Explicit `true` enables bounded development/test funding. Always disabled in production. |

Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
and paste it into the backend `.env`. Do not commit `.env` or credentials.
Use the [MongoDB installation and connection guide](../docs/MONGODB.md) for the
Windows MSI, `mongosh`, local replica-set initialization and Atlas setup.

```powershell
npm.cmd run db:check
npm.cmd run dev
# or npm.cmd start
```

Without a working database, the API still starts and serves health checks. Initial
connection failures are retried every ten seconds; database-dependent routes return
503. A missing JWT secret disables application APIs safely. Production startup
requires a database URI, a secret and an HTTPS frontend origin. A healthy standalone
MongoDB connection is reported accurately, but registration and financial mutations
require transactions and are refused on a standalone deployment.

## API

Responses use `{ success: true, ...data }` or
`{ success: false, error: { code, message, details? } }`. Amounts and balances use
integer **cents**. Cumulative summary totals are integer decimal **strings** to
avoid overflow; the frontend formats them with BigInt. No password hashes, JWTs,
session token hashes or secrets appear in response bodies.

| Method | Path | Access and behavior |
| --- | --- | --- |
| GET | `/api/health` | Public API liveness; keeps the original frontend message. |
| GET | `/api/db-health`, `/api/health/database` | Public bounded database ping/capability check; 503 if unavailable. |
| POST | `/api/auth/register` | `fullName`, `email`, `password`; creates user, zero-balance wallet and session atomically. |
| POST | `/api/auth/login` | `email`, `password`, optional boolean `rememberMe`; sets HttpOnly session cookie. |
| GET | `/api/auth/me` | Current safe user, wallet and CSRF token. |
| POST | `/api/auth/logout` | Revokes this session, clears cookie and disconnects its sockets. |
| GET | `/api/wallet` | Authenticated user's wallet. |
| GET | `/api/wallet/balance` | Own balance in cents and currency. |
| GET | `/api/wallet/summary` | Totals, recent activity, monthly activity and demo funding availability. |
| POST | `/api/wallet/demo-fund` | Explicit development/test only; `{ amountCents }` and `Idempotency-Key`. |
| POST | `/api/transfers/send` | `{ recipientEmail, amountCents, description? }` and `Idempotency-Key`. |
| GET | `/api/transfers/:id` | Owned transaction by MongoDB ID. |
| GET | `/api/transactions` | Paginated owned history. |
| GET | `/api/transactions/:id` | Owned transaction details. |
| GET | `/api/transactions/summary` | Own wallet/transaction summary. |
| GET | `/api/notifications` | Paginated persisted owned notifications and unread count. |
| GET | `/api/notifications/unread-count` | Own unread count. |
| PATCH | `/api/notifications/:id/read` | Mark an owned notification read. |
| PATCH | `/api/notifications/read-all` | Mark all own notifications read. |
| GET | `/api/users/profile` | Own safe profile and wallet. |
| PATCH | `/api/users/profile` | Only `{ fullName }`; email, role and balance edits rejected. |
| PATCH | `/api/users/change-password` | `{ currentPassword, newPassword }`; verifies current password and rotates sessions. |
| GET | `/api/admin/dashboard` | Admin-only counts, volume and recent activity. |
| GET | `/api/admin/users` | Admin-only paginated/searchable user directory. |
| GET | `/api/admin/transactions` | Admin-only transaction monitoring with filters. |
| GET | `/api/admin/system-health` | Admin-only uptime, database and authenticated socket count. |

History accepts `page`, `limit` (1–100), `search`, `type=incoming|outgoing`,
`status=PENDING|COMPLETED|FAILED`, `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, and
`sort=newest|oldest|amount-asc|amount-desc`. Dates are inclusive UTC calendar
boundaries. The API always intersects user filters with wallet ownership.

### Cookie authentication and CSRF

JWTs are HS256 signed with explicit issuer/audience and expiry. Each token also
requires a matching unexpired MongoDB Session, active account and authentication
version. Logout revokes the session, and password changes revoke all old sessions
while issuing a replacement for the current browser.

The session cookie is HttpOnly, SameSite=Lax, host-only and Secure in production.
Without Remember me it is a browser-session cookie; opting in persists it only
until the configured JWT expiry. Neither choice extends server-side token validity.
Every unsafe request requires the exact `Origin`, `Content-Type: application/json`
and `X-PayNet-Request: 1`. Authenticated mutations additionally require the
session-bound `X-CSRF-Token` returned by login/register/me. Use `credentials: include`.
The React API service does this centrally; tokens are never stored in localStorage.

For a nonbrowser API client, retain the cookie from login and set those headers,
including `Origin` equal to `FRONTEND_URL`. Production frontend/API hosts should
share a site (for example `app.example.com` and `api.example.com`) or use a reverse
proxy. Cross-site third-party cookie deployment is not enabled. Configure HTTPS
and trusted proxy handling deliberately when deploying behind a proxy.

Passwords are bcrypt hashed at cost 12, require at least eight characters and
at most 72 UTF-8 bytes. Registration cannot choose a role. Authentication is
limited to 40 attempts per IP per 15 minutes; payment/funding attempts to 60 per IP
per minute. These in-memory limits are intended for a single application instance.
Application request logs contain method/status only, never request bodies,
passwords, JWTs, cookies, identifiers or raw database errors.

## Payment safety

1. The server derives the sender from the authenticated session and normalizes the
   recipient email. Validation rejects objects, extra privilege/balance fields,
   invalid cents, self-transfers and unavailable recipients.
2. A unique `(initiatorUserId, idempotencyKey)` claim, conditional sender debit,
   bounded recipient credit, completed ledger entry and two notifications are
   written in **one MongoDB transaction**. Writes within the session are sequential.
3. The sender update requires sufficient funds; the receiver update guards overflow.
   Any failure rolls back all financial writes. MongoDB handles write conflicts
   through the transaction retry helper. The API reports success only after commit.
4. Repeating the same key/payload returns the original outcome. Reusing a key with
   different data returns 409. A failed key retains its failed outcome, even if the
   sender is funded later; submit an intentional new payment with a new key.
5. Deterministic business failures are recorded as FAILED, without balance changes,
   with an owned failure notification. Unknown network/commit outcomes return 503
   with instructions to retry the **same key**, never a false assertion that no
   payment occurred. The frontend preserves unconfirmed keys/payloads in this tab's
   sessionStorage across reloads, scoped to the signed-in user, until confirmed.
6. Live events are emitted only after commit. Publication failure leaves a successful
   payment successful. Durable notifications and API catch-up recover missed data.

The per-wallet operating limit is 1,000,000,000,000 cents, and one transfer is at most
10,000,000,000 cents. These are educational bounds, not bank limits. All actual
balance updates use integer cents; no decimal floating-point currency calculations
are used. MongoDB uniqueness, sessions and transactions are essential to correctness.

## Controlled demo funding and two-browser exercise

1. Set `NODE_ENV=development` and `DEMO_FUNDING_ENABLED=true`, restart the backend,
   and keep `VITE_DEMO_MODE=false` in the frontend.
2. Open two separate browser profiles (or a normal and private window). Register
   two accounts with emails/passwords you choose. Initial balances are zero.
3. On the sender dashboard, choose **Add demo funds**. Each click adds at most
   LKR 1,000. A wallet can receive only LKR 10,000 total through this mechanism over
   its lifetime, including funds already spent. Repeated/replayed requests do not
   bypass the cap. The endpoint accepts no target user or wallet ID.
4. Send a virtual amount to the receiver's email and confirm the existing modal.
   Wait for the server-confirmed reference. Both dashboards should update.
5. Check incoming/outgoing history, receive details, notification read markers and
   profile changes. Disconnect the receiver's network, send another payment, then
   reconnect: persisted APIs restore missed updates.
6. To exercise concurrent payments automatically, run `npm.cmd run test:api`.
   The suite sends simultaneous same-key requests and competing debits.

The funding endpoint is disabled in production regardless of the flag. There is
no unauthenticated fund, arbitrary balance-edit or public admin creation endpoint.

## Create the first administrator

Bootstrap is a local development-only CLI. Choose your own private credentials;
none are committed or publicly seeded. From `backend/`, with `.env` configured:

```powershell
$env:ALLOW_ADMIN_BOOTSTRAP = 'true'
$env:ADMIN_EMAIL = Read-Host 'Private admin email'
$adminSecurePassword = Read-Host 'Private admin password' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecurePassword).Password
npm.cmd run admin:create
Remove-Item Env:ADMIN_PASSWORD, Env:ADMIN_EMAIL, Env:ALLOW_ADMIN_BOOTSTRAP
Remove-Variable adminSecurePassword
```

`NODE_ENV` must explicitly be `development`. The CLI refuses an existing admin or
an already registered email; it never promotes a public account. It atomically
creates an administrator and wallet. Sign in through the existing login page to
open `/admin`. Production administrator provisioning/recovery needs an appropriate
operator-controlled process; this development bootstrap cannot run in production.

## Network architecture

React → credentialed HTTP API → authentication/validation → services → MongoDB.
Socket.IO shares the same HTTP server. `/payments` is the authenticated namespace;
its middleware verifies the cookie against the signed JWT, active user and database
session before joining server-derived user/session rooms. Client room/user choices
and incoming financial events are rejected. Sessions are checked again before
delivery; logout, expiry and password changes disconnect affected sockets.

Events: `payment:sent`, `payment:received`, `wallet:updated`, `transaction:updated`,
`notification:new`. Each event describes committed owned state. React refetches
wallets, summaries and persisted notifications after changes and every reconnect,
and periodically resynchronizes while connected. This also recovers from a crash
between database commit and socket publication. Delivery is best effort; a durable
outbox/distributed message adapter is not implemented or claimed.

This demonstrates persistent connections (WebSocket with polling fallback),
event-driven messages, concurrent clients, private addressing, reconnect/backoff,
request acknowledgments in the preserved diagnostic demo, and client/server state
resynchronization. `/network-demo` and the anonymous default diagnostic namespace
remain development-only demonstrations; they cannot perform payments or join
financial rooms. Production rejects the diagnostic namespace and keeps the
authenticated `/payments` channel available.

## Tests and structure

```powershell
npm.cmd test
npm.cmd run test:database
npm.cmd run test:api
npm.cmd run lint
```

The Node suite preserves network/security regressions and checks model/money/config
behavior without MongoDB. Database and Vitest/Supertest API suites create isolated
real MongoDB processes, including transaction commit/rollback and standalone
rejection. They never use `MONGODB_URI` from the application's `.env`. The first run
downloads an official MongoDB binary into ignored `.mongodb-binaries/`; use
`MONGOMS_SYSTEM_BINARY` for an installed binary or `MONGOMS_VERSION` to select a
compatible version. An unavailable binary/download blocks these integration suites;
it does not count as a passing database test.

From `frontend/`, run `npm.cmd test` for the original sample UI regressions and
`npm.cmd run test:live` for real registration, two-user payments, notifications,
profile persistence, logout, admin login and a lost-response/reload/idempotent-retry
scenario. These commands start isolated servers on 5003/5175 and 5002/5174 and use
the existing Windows Edge configuration. No administrator fixture credentials are
printed; live test credentials are randomly generated for the disposable database.

`app.js` owns HTTP middleware/routes; `server.js` owns startup, sockets and shutdown.
`config/`, `middleware/`, `routes/`, `models/`, `services/`, `utils/`, `socket/`,
`scripts/`, `testing/` and `integration/` separate responsibilities without replacing
the existing networking modules. Controllers are small route handlers delegating
to services rather than duplicated per-route files.

For an earlier foundation database containing integer-cent `balance`/`amount`
fields, stop application writers, back up the database and run `npm.cmd run db:migrate`
before `db:check`. This atomically renames fields to `balanceCents`/`amountCents`,
normalizes statuses and preserves values/references. It validates all legacy values
and rejects conflicts rather than discarding or silently zeroing them. No PostgreSQL
integration was present in this workspace, so there was no SQL driver or query to remove.

## Verification record

53 backend Node tests, 9 database tests, 31 Vitest/Supertest API tests, 18 frontend
unit tests, 15 original browser regressions and 3 live browser scenarios passed.
Both linters and the production frontend build passed. Full file inventory, tested
behaviors and remaining machine setup are in [TASK04_VERIFICATION.md](../docs/TASK04_VERIFICATION.md).
