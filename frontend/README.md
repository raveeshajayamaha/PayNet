# PayNet frontend

React JavaScript + Vite with Tailwind CSS, React Router, Lucide, Recharts and Framer Motion.

## Run

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Run the backend separately (`cd backend`, `npm run dev`) for the health check. With `MONGODB_URI` unset, development previews work without a database. See [MongoDB setup](../docs/MONGODB.md) to connect the database.

Copy `.env.example` to `.env` when changing configuration:
- `VITE_API_URL=http://localhost:5000` is the backend origin without `/api`.
- `VITE_DEMO_MODE=false` (default) enables real virtual accounts, authenticated routes and backend data. Set `true` explicitly to retain the original sample preview. Restart Vite after environment changes.
- `VITE_SOCKET_URL=http://localhost:5000` is the shared Socket.IO server origin. Financial updates use its authenticated `/payments` namespace.

## Pages

`/`, `/login`, `/register`, `/dashboard`, `/send-money`, `/receive-money`, `/transactions`, `/notifications`, `/profile`, `/admin`, and catch-all 404.

## Files and responsibilities

- `src/pages/Home.jsx`: photographic landing page.
- `src/pages/Auth.jsx`: login/register forms with validation and visibility controls.
- `src/pages/Workspace.jsx`: user pages, admin analytics, 404.
- `src/layouts/Layouts.jsx`: PublicLayout, AuthLayout, DashboardLayout, AdminLayout, Navbar, Footer, Sidebar, Topbar.
- `src/components/UI.jsx`: reusable cards, badges, tables, accessible native modal, inputs, guards, health panel.
- `src/context/AppContext.jsx`: memory-only demo profile and notifications.
- `src/data/demo.js`: fictional users, wallet, transactions and chart fixtures.
- `src/services/`: centralized API client and auth, wallet, transaction, notification, admin service boundaries.
- `src/index.css`: design system, responsive pages and reduced-motion support.
- `vite.config.js`, `.env.example`, package files, `public/favicon.svg` and local `public/images/` assets.

## Connected data and sample preview

With sample mode disabled, login/register use the real API, dashboards load wallet summaries, sends require committed server confirmation, transaction search/filter/pagination use owned backend history, notifications persist read markers, profiles save full names, password changes rotate sessions and the admin page loads authorized statistics. Existing form/modal design, images, navigation and responsive layouts are retained.

The API client includes the HttpOnly cookie, exact request headers and an in-memory CSRF token. No JWT/password is stored in localStorage or sessionStorage. Authenticated route guards wait for `/api/auth/me`; the backend independently authorizes every protected operation. Logout revokes the server session. The existing health panel reports API liveness; `/api/db-health` separately reports database readiness.

Unconfirmed payment keys/payloads are retained in this tab's sessionStorage, scoped to the signed-in user, so a reload can retry the same request safely. They are removed after a confirmed outcome. No success appears until the backend returns a COMPLETED transaction. Lost responses show an unconfirmed outcome and a same-key retry action.

Socket.IO refetches committed state after live events and reconnects, with periodic resynchronization and actionable network errors. A controlled development funding button appears only when enabled by the backend, with a lifetime cap. [Backend setup and API documentation](../backend/README.md) describes account creation, funding, replica sets and admin provisioning.

With `VITE_DEMO_MODE=true`, the original fictional dashboard, sample CSV, in-memory profile and unavailable financial actions remain intact. Demo/sample labels distinguish this preview from connected virtual account data.

## Checks

```powershell
npm run lint
npm run build
npm run test:unit
npm test
npm run test:live
```

Hosting must rewrite unknown application routes to `index.html` for deep links. Google Fonts requires internet and falls back to system fonts. Photography is local; credits and license appear in `public/images/CREDITS.md`.

## Current verification

- `npm run lint`: passed without warnings.
- `npm run build`: passed; code-split bundles stay below Vite's chunk-size warning threshold.
- `npm run test:unit`: 18 frontend unit tests passed.
- `npm test`: all 15 original browser regressions passed using Microsoft Edge.
- `npm run test:live`: 3 live browser scenarios passed against isolated real MongoDB, including registration, funding, transfers, reconnect catch-up, notification persistence, profile/password changes, logout, admin login and lost-response retry after reload.
- All 11 page types rendered without JavaScript runtime exceptions.
- Desktop, 390px mobile, and additional 320px/768px/1024px checks passed; mobile menus and sidebars work.
- Local photographs loaded; transaction filtering, pagination, CSV download and details passed.
- Transfer validation, Escape dismissal, unavailable-payment result, login/register validation, memory-only profile changes, notification read states and empty state passed.
- Existing `/api/health` responded successfully through the dashboard; simulated network failure showed an actionable message.

Browser commands start their own isolated frontend/backend servers. Original sample regressions use ports 5175/5003; live tests use 5174/5002. They do not reuse development servers on 5173/5000. The configurations target Microsoft Edge on this Windows machine; adapt `executablePath` for another machine or an installed Playwright browser.

Accounts, virtual payments, profile/read-marker persistence, admin monitoring and live events now use the backend. Actual bank payments, distributed socket adapters and durable event outboxes are outside this educational application. Google Fonts falls back to system fonts offline. No commit or push is performed by this task.

## Historical Task 03.2 visual enhancement

All existing pages now share a navy, royal blue, cyan and restrained violet visual system. `src/visual-enhancements.css`, imported after the base stylesheet, holds the visual layer without duplicating pages or changing service behavior. Authentication uses separate local photographic backgrounds; workspace route headers use matching photos or original financial-flow artwork. Cards, transaction states, notifications, profile details, modal surfaces, forms and 404 have been refined. Hover effects retain reduced-motion support, and smaller screens receive stacked layouts and readable banners.

Changed existing files: `src/main.jsx`, `src/layouts/Layouts.jsx`, `src/pages/Auth.jsx`, `src/components/UI.jsx`, this README and image credits. Added files: `src/visual-enhancements.css`, `public/images/city-night.jpg`, `public/images/financial-flow.svg`. The three feature-card image files, routes, API services, demo behavior, backend and database are preserved. No dependencies were added for this enhancement.
