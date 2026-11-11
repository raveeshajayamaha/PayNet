# Task 04 implementation and verification

Implemented directly in `C:\Users\DELL\Desktop\RathnayakaSK_EG20235830\PayNet-New`.
The alternate Downloads path in the task text was not present. No PostgreSQL driver,
schema or query existed in this copy. Existing uncommitted work, including the
frontend lockfile changes present at task start, was preserved.

## Completed behavior

- Atomic registration creates a user, zero-balance wallet and revocable session.
- bcrypt/JWT login, HttpOnly cookies, Remember me, CSRF, logout, active-account and
  server-role enforcement, profile updates and verified password changes.
- Integer-cent wallets, exact totals/display, bounded opt-in development funding.
- Transactional virtual transfers with conditional debit, bounded credit, unique
  user-scoped idempotency keys/fingerprints, audit references, retry-safe outcomes
  and persisted notifications. No success is emitted for rollback.
- Owned searchable/filterable/paginated/sortable history and notification read APIs.
- Authenticated Socket.IO user/session rooms, sender/receiver events, revocation
  checks, reconnect API catch-up, wallet/history/unread refresh and network fallback.
- Admin dashboard/user listing/transaction monitoring/system health and an explicit
  development-only initial-admin CLI without public credentials.
- All existing React pages now use live APIs in connected mode. Original sample
  preview remains explicitly available. Layouts, images, styles, animations, forms,
  modals and responsive navigation were retained.
- Database-independent liveness and safe database health aliases; automatic retry
  after an initial connection failure. Explicit legacy-cent migration avoids zeroing
  balances when upgrading the earlier foundation schema.

## Created files

| Area | Files |
| --- | --- |
| Entry/config | `backend/app.js`, `backend/config/database.js`, `backend/config/security.js`, `backend/api-vitest.config.mjs` |
| Models | `backend/models/{User,Wallet,Transaction,Notification,Session,index}.js` |
| API/security | `backend/routes/api.js`, `backend/middleware/{auth,validation}.js`, `backend/utils/{errors,money}.js` |
| Services | `backend/services/{authentication,databaseTransaction,payments,queries,runtime}.js` |
| Live networking | `backend/socket/payments.js` |
| Operators | `backend/scripts/{check-database,create-admin,migrate-money-fields}.js` |
| Test support | `backend/testing/browser-server.js`, `backend/tests/database.test.js`, `backend/integration/{database.integration.js,api.spec.mjs}` |
| Frontend adapters | `frontend/src/hooks/useRemoteData.js`, `frontend/src/services/{liveData,pendingPayments}.js` |
| Browser/unit tests | `frontend/playwright.live.config.js`, `frontend/live-tests/payments.spec.js`, `frontend/unit/liveData.test.js` |
| Documentation | Root `README.md`, `backend/README.md`, `docs/MONGODB.md`, this verification record |

The MongoDB foundation files originated in the preceding migration task and were
extended here. They remain untracked in Git because neither task created a commit.

## Modified existing files

- Backend: `server.js`, `socket/config.js`, `socket/index.js`, `.env.example`,
  `package.json`, `package-lock.json`, `tests/network.test.js`.
- Frontend: `src/context/AppContext.jsx`, `src/components/UI.jsx`,
  `src/layouts/Layouts.jsx`, `src/pages/{Auth,Workspace}.jsx`,
  `src/services/{api,auth,wallets,transactions,notifications,admin}.js`,
  `.env.example`, `package.json`, `playwright.config.js`, `README.md`.
- Original browser tests: only hardcoded backend/home origins changed to their
  isolated test-server locations; regression assertions remain in place.
- Repository support: `.gitignore`, `docs/TEAM_INTEGRATION.md` current-version note.

No public image assets, CSS files, animation styles, route definitions, home-page
design or demo data were deleted/replaced. Existing networking test modules and
protocols remain in place. No external database or existing development server was
modified by the test suites.

## Validation

Verified with Node.js 24.13.0, Mongoose 9.12.1, MongoDB 8.2.6, Vitest 5.1.0,
Supertest and Windows Edge. MongoDB integration tests used actual disposable
`mongod` processes; results are not mocked database claims.

| Command | Result |
| --- | --- |
| Backend `npm.cmd test` | 53 passed |
| Backend `npm.cmd run test:database` | 9 passed |
| Backend `npm.cmd run test:api` | 31 passed |
| Frontend `npm.cmd run test:unit` | 18 passed |
| Frontend `npm.cmd test` | 15 original browser tests passed |
| Frontend `npm.cmd run test:live` | 3 live end-to-end scenarios passed |
| Both linters | Passed |
| Frontend production build | Passed |
| `git diff --check` | Passed |

Payment tests cover success, insufficient funds, invalid amounts, self/unknown/
inactive recipients, same-key replay, changed-payload conflicts, eight concurrent
same-key sends, competing debits, precommit fault rollback, receiver overflow,
lifetime funding caps and transport-publication failure after commit.

Browser tests additionally abort a successful payment response, reload the sender
page, retry its persisted key and prove the receiver is credited only once. They
also disconnect the receiver, send while offline, reconnect and verify catch-up.

## Setup still required on the user's machine

No persistent MongoDB service or Atlas account/credentials were provisioned. Install
MongoDB or create an Atlas cluster, configure a replica set, set `MONGODB_URI` and a
private `JWT_SECRET`, then start the application. Instructions and verification
commands are in [MongoDB setup](MONGODB.md) and [backend/README.md](../backend/README.md).

All requested educational application features are implemented. Real bank rails,
certification, a distributed deployment and durable socket outboxes are not claimed.
