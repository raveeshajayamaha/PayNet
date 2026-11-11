# PayNet networking foundation — M3-01

This is a development/test networking demo, not a live payment system. It has no database dependency, authentication, balance updates, payment processing, or user-room subscriptions.

## Repository baseline

The `feature/socketio-networking` branch initially contained only `.gitignore` (HEAD `b1d5f58`). Existing `backend/` files were recovered from local `origin/backend` and `frontend/` files from local `origin/frontend` without switching branches, modifying those refs, committing, or pushing. The recovered UI and HTTP health endpoint remain intact. These directories therefore appear as new files relative to the initial branch. No PostgreSQL implementation was present or changed.

## Start locally

Node.js 24 was used for validation. In two PowerShell terminals:

```powershell
cd E:\PayNet\backend
npm.cmd ci
Copy-Item .env.example .env # first setup only; preserve any existing .env
npm.cmd run dev
```

```powershell
cd E:\PayNet\frontend
npm.cmd ci
Copy-Item .env.example .env # first setup only; preserve any existing .env
npm.cmd run dev
```

Open **http://localhost:5173/network-demo**. Backend HTTP and Socket.IO share port **5000**; `/api/health` retains its original response. `npm.cmd start` also starts the backend. `.cmd` avoids PowerShell's npm.ps1 execution-policy restriction.

Backend configuration: `PORT=5000`, `FRONTEND_URL=http://localhost:5173`, `NODE_ENV=development`. Socket.IO is attached only in `development` or `test`; an unset NODE_ENV defaults to local development. Set `NODE_ENV=production` for deployment: no Socket.IO endpoint is attached. Other environment names also disable it. Frontend `VITE_SOCKET_URL=http://localhost:5000` is independent of the existing `VITE_API_URL`; restart Vite after changing it. Only `import.meta.env.DEV` enables the demo route, so production builds exclude its module. Keep localhost spelling consistent: a browser at `127.0.0.1` requires matching `FRONTEND_URL`.

## Communication flow and ownership

`backend/server.js` exports a server factory for isolated tests and wraps the existing Express app in a Node HTTP server. `socket/index.js` attaches Socket.IO, checks origins for both polling and WebSocket handshakes, reports client counts, and logs connection lifecycle counts without payloads, tokens, IP addresses, or socket IDs. `socket/events.js` defines the allowed protocol, and `socket/handlers.js` validates and acknowledges requests.

The demo mounts → the hook registers listeners → the shared service connects → server broadcasts a client count → a button emits a validated request → server returns an acknowledgment exclusively to that requester → UI displays the response and elapsed round-trip time. No test message is broadcast or persisted. Socket.IO manages HTTP polling and WebSocket upgrades; see the [official server initialization documentation](https://socket.io/docs/v4/server-initialization/).

## Events

| Event | Direction | Payload / result |
| --- | --- | --- |
| `network:ping` | Client → server, acknowledgment required | Exactly `{}`; success `{ok:true,message:"pong",serverTime:ISO8601}` |
| `network:message` | Client → server, acknowledgment required | Exactly `{message:string}`; 1–500 characters, nonblank; success `{ok:true,message:trimmedText,serverTime:ISO8601}` |
| `network:clients` | Server → all demo sockets | `{count: nonnegativeInteger}` on connection/disconnection |
| `network:error` | Server → requester | `{code,message}` when request has no acknowledgment |

Failed requests with an acknowledgment receive `{ok:false,error:{code,message}}`. Codes include `INVALID_PAYLOAD`, `PAYLOAD_TOO_LARGE`, `UNKNOWN_EVENT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `FORBIDDEN_EVENT`, and `TEST_NOTIFICATIONS_DISABLED`. Unknown events cannot mutate application state or subscribe to rooms. Each socket is limited to 20 incoming application events per rolling 10-second window, including invalid requests and notification test requests. The decoded application event has a 4096-byte UTF-8 JSON limit; the incoming transport-message limit is 8 KiB. Oversized transport packets may disconnect the client rather than produce an application acknowledgment.

## Connection management

The frontend service creates one socket lazily per browser tab, with automatic connection disabled until a consumer mounts. In development the app provider maintains the notification subscription across client-side route changes; the network demo shares that socket. Listener registration precedes connection; cleanup removes the exact callbacks, including manager reconnect listeners. Reference counting disconnects after the last consumer leaves, and hot-module disposal closes the old connection. React StrictMode can perform an initial connect/cleanup/connect cycle; it does not retain duplicate sockets. The latest connected-client count is cached so the demo can display it when opened after the provider already connected.

Network failures trigger at most eight automatic retries with exponential backoff (500 ms initial base, 5-second maximum base, 0.5 jitter). Explicit Disconnect pauses recovery. Permanent authorization rejections and server-directed disconnects stop automatic retry; access must be checked before selecting Connect. Retry exhaustion also requires explicit Connect. Connection failures use fixed public messages without raw server details. Every client request requires an active connection and an acknowledgment timeout of at most five seconds; disconnected requests are rejected instead of queued. Cancellation removes only its own buffered request and timed callback. Requests are not automatically resent. A successful later connection clears the active connection error. Socket IDs change after reconnection and are diagnostic only. Counts measure sockets/tabs on one server process, not authenticated users; they are unknown while disconnected. The event log retains at most 100 local entries, and the manager retains ten sanitized network errors. See [Socket.IO client options](https://socket.io/docs/v4/client-options/).

## Testing

With backend and frontend running, open the demo in two tabs. Verify count 2, ping `pong`, trimmed message acknowledgment, disconnect/reconnect, and clear log. Stop the backend, observe connection failure/retry, restart it, and verify automatic recovery and a new socket ID. Test an empty message (Send disabled). Use only sample text. No payment should occur.

```powershell
cd E:\PayNet\backend
npm.cmd test
npm.cmd run lint
cd E:\PayNet\frontend
npm.cmd run lint
npm.cmd run build
npm.cmd run test:unit
npm.cmd test
```

Backend tests use Node's test runner, ephemeral HTTP ports, and real socket.io-client connections; no database or running dev servers are needed. They cover health, simultaneous clients and disconnect counts, private ping/message acknowledgments, invalid payloads, unknown events, missing acknowledgments, rate limits, polling/WebSocket origin rejection, disabled production/staging endpoints, and automatic recovery after a real server restart.

Frontend Playwright tests require the two dev servers above. The existing repository configuration uses installed Microsoft Edge at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; adjust the existing browser configuration on other systems. The new browser test checks connection/count/ID, ping, message, controls, log clearing, mobile width, navigation cleanup, and runtime errors. Existing frontend tests remain included.

Validation on 2026-11-11: backend tests **8/8 passed**, frontend Playwright tests **9/9 passed** (eight existing and one networking test), both lint commands passed, and the Vite production build passed. The built output contains neither the networking demo text nor its event names. Dependency installation audits reported zero vulnerabilities. Windows sandbox permissions required elevated execution for npm installation, Vite temporary files, and browser launch; no application changes were needed for those restrictions.

## Limitations and future integration

Origin checks are browser safeguards, not authentication: non-browser clients can omit/spoof an Origin. This unauthenticated demo must stay in local development. Per-socket limits are a modest demo safeguard; reconnecting resets them. There is no distributed adapter, IP-wide abuse protection, durable delivery, event replay, or payment reliability guarantee. Rate and connection limits for a deployed service require separate design. The page keeps the last successful acknowledgment for inspection when another request fails or the connection drops.

Future payment notifications must use real authentication supplied by the authentication owner, verify identity during handshake, and publish minimal notifications only after committed payment transactions. M3-02 adds the fail-closed publisher described below, with no client room subscriptions. Add TLS, deployment origin configuration, real credential/revocation integration tests, and a distributed adapter if needed. Clients must never choose financial recipients, submit trusted balances, or treat a socket acknowledgment as proof of payment. No payment processing is implemented here.

## M3-02 notification architecture

`shared/notification-events.json` is the shared, versioned source of event names for backend and frontend. The task repeated the name "payment" twice; this implementation distinguishes completed and failed outcomes. These are server-to-client contracts, not commands clients may send:

| Event | Type | Purpose |
| --- | --- | --- |
| `notification:v1` | `info` | Future authorized user notice |
| `payment:completed:v1` | `payment.completed` | Future notification of a committed payment outcome |
| `payment:failed:v1` | `payment.failed` | Future notification of a verified payment failure |
| `notification:test:v1` | `test` | Nonfinancial development notice, originating socket only |
| `notification:test:request:v1` | n/a | Development client request; payload exactly `{}`, acknowledgment required |

All notice payloads have exactly the following required fields and optional `transactionRef`:

```json
{
  "version": 1,
  "id": "notice-example-001",
  "type": "test",
  "message": "Development test notification. No payment was made.",
  "timestamp": "2026-11-11T10:00:00.000Z"
}
```

This is a contract example, not evidence of a payment. A future completed-outcome payload would use `type: "payment.completed"`, a truthful minimal message, and optionally `transactionRef: "tx-example-001"`. IDs and references must contain 1–128 ASCII letters, digits, underscores, or hyphens. Messages must be nonblank and at most 500 characters. Timestamps must be canonical UTC ISO strings with milliseconds. Version/type mismatch, extra properties (including recipient IDs), arrays, and malformed values are rejected. Test notices cannot include a transaction reference. Keep balances, account details, and other unnecessary private information out of messages. The backend validates all emitted notices; the frontend independently validates incoming notices before displaying them.

### Safe test flow

Network demo button → `notification:test:request:v1` with `{}` and a five-second timeout → existing server payload/rate-limit middleware → server creates a UUID, fixed nonfinancial text, and current timestamp → validates envelope → `socket.emit('notification:test:v1', payload)` only to requester → acknowledgment contains `notificationId`, a delivery description, and `serverTime`.

No test text or recipient can be chosen by a client. The handler explicitly rejects test requests outside development/test even if later attached to a different transport. Today production/staging have no Socket.IO endpoint at all. The frontend button/route and test feed are development-only. No fake JWT, login, identity, or simulated payment completion exists.

The app provider subscribes once during development and keeps up to 100 test notices in memory, separately from existing sample financial notifications. A dismissible six-second toast labels the notice as a nonfinancial development test. `/notifications` keeps the existing sample cards, filters, and mark-read behavior, and adds a separately labeled test feed with its own Clear button. Test notices are session-only and do not affect sample unread counts. `/network-demo` logs notice IDs and shows a received count. Full page reloads discard the feed.

`notificationListener.js` shares one underlying listener per event/socket among subscribers, deduplicates the latest 200 IDs per event, preserves the subscription through reconnection, and removes exact callbacks when the final subscriber unsubscribes. The app never registers financial listeners using the sample UI user. The reusable listener has a future `authenticated: true` option; this is a UI integration option, not a security control. It must only be wired after real authentication. Security is always enforced by the server publisher.

### Publisher and Member 2 integration

`backend/services/notificationPublisher.js` exposes `createNotificationPublisher` and `publishToUser(userId, event, payload)`. The socket initializer attaches it as `io.notificationPublisher`. Without BOTH trusted `authenticateSocket` and `authorizeNotification` functions the publisher returns `{ok:false,code:"FINANCIAL_NOTIFICATIONS_DISABLED"}` and emits nothing. No environment flag, handshake user ID, or client event enables financial publishing.

Member 2 can pass these adapters through `createPayNetServer` when their real authentication exists:

```js
// Existing factory option names. Bind both callbacks to Member 2's real implementations;
// no authentication or authorization implementation is supplied in this repository.
const { server, io } = createPayNetServer({
  authenticateSocket,
  authorizeNotification,
});
```

`authenticateSocket(socket)` must verify the real session/token and return `{userId}` from trusted server data, or reject. Supplied authentication errors become a generic connection rejection. Verified identity is held in a private WeakMap, never read from `socket.data`, client-supplied user IDs, or room names. All connections on this transport must pass the adapter when configured. Reconnection authenticates again. `authorizeNotification({socket,userId,event,notification})` must return exactly `true` only after checking that the session is still valid and the recipient is authorized for that transaction/reference; missing, false, or thrown decisions cannot deliver that notice to that session. Unit/integration tests use isolated server-side stubs to exercise these interfaces; they are not application login implementations.

M3-04 adds a five-second deadline per adapter verification. Signatures now also accept cancellation: `authenticateSocket(socket, {signal})` and `authorizeNotification({socket,userId,event,notification,signal})`. Null/invalid identities and thrown errors become non-retrying `AUTH_REQUIRED`; a verification deadline produces non-retrying `AUTH_UNAVAILABLE`. The actual provider must honor the AbortSignal. Trusted identities are removed on disconnect. No adapters are supplied by the running default application, so financial delivery remains disabled.

After a successful database commit, Member 2's trusted server code can call:

```js
const result = await io.notificationPublisher.publishToUser(
  committedRecipientUserId, // derived from committed server data, never request body alone
  EVENTS.PAYMENT_COMPLETED,
  validatedNotificationEnvelope,
);
```

`EVENTS` is exported by `notificationContracts.js`. The publisher validates and snapshots the envelope, finds only sockets whose verified identity matches, reauthorizes each session, and emits directly to those sockets. It never calls global `io.emit` for notices. Multiple authenticated sessions for the same user can receive the notice. No matching/authorized session returns `{ok:true,delivered:0}`; success counts emissions, not durable client receipt. Invalid data returns `INVALID_NOTIFICATION`; authorization exceptions return `AUTHORIZATION_FAILED` with a partial delivered count if earlier sessions received it. Do not blindly retry partial delivery. Clients attempting server-only notification/payment events receive `FORBIDDEN_EVENT`; room-join and balance-change events remain unsupported.

Member 2 must still provide actual credentials/session verification, revocation and recipient authorization, transaction outcome data after commit, notification storage, unread/read APIs, and real authenticated frontend lifecycle wiring (including clearing private state on logout/account switch). Production Socket.IO initialization deliberately remains disabled until secure deployment integration is designed; injecting adapters does not enable it in production. Package/deploy the `shared/` directory together with backend/frontend.

### Notification testing and limitations

Run backend `npm.cmd test` and `npm.cmd run lint`; frontend `npm.cmd run test:unit`, `npm.cmd run lint`, `npm.cmd run build`, and `npm.cmd test` with both dev servers running. Node tests cover contracts, recipient spoofing, non-broadcast delivery, forbidden financial events, disabled publishers, verified-user targeting, authorization denial, generic authentication errors, reconnect, production transport/handler restrictions, listener sharing, deduplication, cleanup, malformed inbound payloads, and opt-in future financial contracts. Playwright additionally checks toast/feed delivery, privacy across tabs, controls, navigation, reconnect, and clearing test notices, alongside all existing UI/network tests.

Manual check: open `/network-demo` in two tabs, send a test notice in one, and verify only that tab receives its toast and count increment. Follow "View notifications" and inspect the separate nonfinancial feed. Go back, disconnect/connect, send again, and confirm exactly one new notice. Clear test notices without changing the sample financial cards. Restart the backend and confirm automatic connection recovery; missed notices are not replayed. In production the demo route is absent and the Socket.IO handshake returns 404.

No durable notification storage, retry/outbox, replay, cross-process routing, or real payment integration is implemented. Publisher targeting currently scans sockets in one process and requires a future distributed design for multiple servers. It does not disconnect revoked sessions itself; the authorization adapter must deny delivery and the auth owner must implement session invalidation/disconnect policy. Bounded deduplication is not an exactly-once guarantee. No new dependencies were needed for M3-02.

M3-02 validation on 2026-11-11: **15 backend tests**, **4 frontend listener unit tests**, and **10 browser tests passed**. Backend/frontend lint and the final Vite production build passed. The networking browser test now accepts a positive connected-client count instead of assuming no other developer tabs are open; isolated backend tests still assert exact counts. Changes remain uncommitted on `feature/socketio-networking`.

## M3-03 diagnostics and multi-client testing

See [NETWORK_TESTING.md](./NETWORK_TESTING.md) for the test matrix, commands, methodology, executed results, and environmental limitations, and [network-performance-results.json](./network-performance-results.json) for the raw local measurements.

The development network demo adds a ten-sample **Run Latency Test** action, an accessible SVG latency chart, minimum/maximum/average/median/nearest-rank p95 RTT statistics, latest manual ping RTT, and a reconnection-attempt counter. It reuses the current socket, paces requests by 650 ms, limits a run to 15 seconds, and imposes a ten-second cooldown. Disconnecting or leaving the page cancels sampling; results/errors identify incomplete runs and show only successful samples. No browser load test starts automatically. Shared `shared/latency.mjs` computes statistics using monotonic elapsed time rather than server timestamps.

Backend tests now include isolated groups of 2/5/10/25 independent clients, count restoration to zero, acknowledgment/privacy checks, transport loss, server restart, deliberate acknowledgment timeout, rapid cycles, frontend request cancellation, and listener cleanup. `npm.cmd run test:multi` runs the multi-client/reliability subset. `npm.cmd run test:performance -- --write-report` creates a separate IPv4-loopback-only server and at most 25 clients, sends only bounded ping traffic, reports operation outcomes and latency, then closes all sockets. It accepts no external-target URL and refuses production environments. Existing database/authentication/payment code and financial-event restrictions are unchanged.

## M3-04 security and network health

[NETWORK_SECURITY.md](./NETWORK_SECURITY.md) documents the threat model, origin/size/rate/error policies, cleanup ownership, future authentication requirements, deployment limitations, and changed files. `SOCKET_ALLOWED_ORIGINS` configures exact comma-separated HTTP(S) origins; invalid/wildcard configurations fail closed. It defaults to `FRONTEND_URL` when unset and remains independent of REST CORS. Production Socket.IO remains disabled.

The shared development connection manager owns lifecycle listeners and one synchronized state snapshot. `/network-demo` adds current connection uptime, transport, retry state, a diagnostics summary, and the latest ten sanitized errors. React consumers share that snapshot and cannot restart a blocked/exhausted connection merely by mounting. Reconnection attempt totals now apply to the current browser tab's manager lifetime rather than only the demo-hook mount. Sensitive debug fields remain development-only.

## Final team handover and demonstration

Use [TEAM_INTEGRATION.md](./TEAM_INTEGRATION.md) for the real factory/callback/publisher interfaces, JWT verification requirements, optional future verified-user rooms, post-commit publishing and duplicate-notification precautions. No fake verifier, SQL schema, or payment API is supplied. Current private publication targets verified sockets directly; named user rooms are a documented future option, not an implemented feature.

[MEMBER3_PRESENTATION.md](./MEMBER3_PRESENTATION.md) provides a timed 3–5 minute script, demonstration steps and lecturer questions. [FINAL_NETWORKING_VERIFICATION.md](./FINAL_NETWORKING_VERIFICATION.md) contains final validation and Git review. The latest performance JSON was refreshed during handover; older milestone measurements in NETWORK_TESTING.md are explicitly historical.
