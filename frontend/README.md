# PayNet frontend

React JavaScript + Vite with Tailwind CSS, React Router, Lucide, Recharts and Framer Motion.

## Run

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Run the existing backend separately (`cd backend`, `npm run dev`) for the health check. PostgreSQL is not needed for UI previews.

Copy `.env.example` to `.env` when changing configuration:
- `VITE_API_URL=http://localhost:5000` is the backend origin without `/api`.
- `VITE_DEMO_MODE=true` enables demo user/admin routes. Set `false` to disable preview access. Restart Vite after environment changes.

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

## Demo and integration boundaries

Only `GET /api/health` exists and is called by Check connection in user/admin dashboards. Other service methods intentionally reject with a backend-unavailable message. No invented endpoints are called. Confirmation never changes balances or fabricates a payment. CSV export is labeled demo data. Profile edits and notification read markers reset on reload. No credentials are stored in localStorage.

ProtectedRoute and AdminRoute control demo navigation only; they are not authentication or authorization. With demo mode disabled, workspace routes redirect to login. Real sign-in and authorized data loading must be implemented before enabling a live workspace. A health response says nothing about database, payment or identity availability.

Backend requirements: registration, JWT session lifecycle, user/admin authorization, wallet lookup, atomic transfers, transaction query/pagination, profile/password changes, notification persistence and Socket.IO events, administration and telemetry.

## Checks

```powershell
npm run lint
npm run build
npm run preview
```

Hosting must rewrite unknown application routes to `index.html` for deep links. Google Fonts requires internet and falls back to system fonts. Photography is local; credits and license appear in `public/images/CREDITS.md`. Backend and database files are unchanged.

## Verified results

- `npm run lint`: passed without warnings.
- `npm run build`: passed; code-split bundles stay below Vite's chunk-size warning threshold.
- `npx playwright test`: 8 browser tests passed using local Microsoft Edge.
- All 11 page types rendered without JavaScript runtime exceptions.
- Desktop, 390px mobile, and additional 320px/768px/1024px checks passed; mobile menus and sidebars work.
- Local photographs loaded; transaction filtering, pagination, CSV download and details passed.
- Transfer validation, Escape dismissal, unavailable-payment result, login/register validation, memory-only profile changes, notification read states and empty state passed.
- Existing `/api/health` responded successfully through the dashboard; simulated network failure showed an actionable message.

Browser tests require the frontend and backend to be running. `playwright.config.js` currently targets the Microsoft Edge executable installed on this Windows machine; adapt `executablePath` for another machine or an installed Playwright browser.

Remaining limitations are intentional backend boundaries, not simulated successes: no real accounts, payments, persistent profile/notification updates, admin mutations, database telemetry or real-time events. Google Fonts falls back to system fonts offline. This checkout has no Git metadata, so no commit or Git diff was created.

## Task 03.2 visual enhancement

All existing pages now share a navy, royal blue, cyan and restrained violet visual system. `src/visual-enhancements.css`, imported after the base stylesheet, holds the visual layer without duplicating pages or changing service behavior. Authentication uses separate local photographic backgrounds; workspace route headers use matching photos or original financial-flow artwork. Cards, transaction states, notifications, profile details, modal surfaces, forms and 404 have been refined. Hover effects retain reduced-motion support, and smaller screens receive stacked layouts and readable banners.

Changed existing files: `src/main.jsx`, `src/layouts/Layouts.jsx`, `src/pages/Auth.jsx`, `src/components/UI.jsx`, this README and image credits. Added files: `src/visual-enhancements.css`, `public/images/city-night.jpg`, `public/images/financial-flow.svg`. The three feature-card image files, routes, API services, demo behavior, backend and database are preserved. No dependencies were added for this enhancement.
