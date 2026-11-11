# PayNet

An educational real-time virtual payment system: React/Vite, Express, MongoDB/Mongoose,
HttpOnly JWT sessions and Socket.IO. All funds are virtual; this is not a banking service.

Users can register, log in, obtain a wallet, send atomic virtual payments, view
history, receive private live notifications, update profiles and change passwords.
Administrators can monitor users, transactions and system health. The original UI,
images, animations, responsive layouts and routes remain in use.

## Run locally

Use Node.js 24 and a transaction-capable MongoDB deployment. Follow
[MongoDB setup](docs/MONGODB.md) to install a local replica set or connect Atlas.

```powershell
Set-Location backend
npm.cmd ci
Copy-Item .env.example .env
```

Edit `backend/.env`: set `MONGODB_URI` and a private `JWT_SECRET` (generate with
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
Optionally set `DEMO_FUNDING_ENABLED=true` for the bounded development funding button.

```powershell
npm.cmd run db:check
npm.cmd run dev
```

In another terminal, from the project root:

```powershell
Set-Location frontend
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

Use `VITE_DEMO_MODE=false` for connected features. Open http://localhost:5173 and
register two accounts in separate browser profiles. Log into each account, add demo
funds to the sender, send a virtual payment and watch both dashboards update.
Use matching `localhost` hostnames for frontend/backend cookies.

`GET /api/health` works without MongoDB. `GET /api/db-health` (also
`/api/health/database`) verifies database readiness and transaction capability.

## Tests

```powershell
# backend directory
npm.cmd test
npm.cmd run test:database
npm.cmd run test:api
npm.cmd run lint

# frontend directory
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run build
npm.cmd test
npm.cmd run test:live
```

Database/API/live-browser tests use isolated real MongoDB processes and never your
configured application database. The first run downloads a test binary; an existing
`mongod` can be supplied with `MONGOMS_SYSTEM_BINARY`. Browser tests launch their own
servers on ports 5002/5174 and 5003/5175, leaving development ports untouched.

See [backend/README.md](backend/README.md) for environment settings, the complete API,
admin bootstrap, safety constraints, demo funding, two-browser exercises and test results.
See [frontend/README.md](frontend/README.md) for frontend data flow and sample mode.
Earlier networking milestone reports remain under `docs/` as historical records;
the root/backend READMEs describe the current connected application.

[Task 04 verification and changed-file inventory](docs/TASK04_VERIFICATION.md).
