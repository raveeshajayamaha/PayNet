# PayNet M3-04: network security, reliability and resilience

This is a local development networking foundation, not a production payment service. M3-04 does not implement authentication, PostgreSQL, wallets, or payment processing. Financial notification publishing remains disabled unless Member 2 supplies both verified server-side authentication and recipient-authorization adapters. No client event, environment flag, sample UI user, or test notice enables it.

## Security boundaries and threat model

The protected boundary is untrusted Socket.IO input entering the development Express/HTTP server, plus the frontend's handling of network errors and connection lifecycle. Threats covered include an unapproved browser origin, malformed/oversized events, repeated or unsupported requests, forged payment events, recipient/room impersonation, untrusted error text, lost connections, and duplicate or stale listeners.

Origin checks are **not authentication**. Native clients can omit or forge Origin; this is intentionally allowed for local tests and does not grant financial access. A compromised trusted authentication adapter or server process is outside this module's security boundary. The test suite is not a penetration test, DDoS certification, or guarantee that the system is safe for real money.

## Environment and origin policy

`backend/socket/config.js` enables Socket.IO only for `development` and `test`. An unset NODE_ENV defaults to development in the existing server factory. Production and other environment names expose no Socket.IO endpoint, even if authentication adapters are supplied. The frontend `/network-demo` route, socket-ID display, health panel, retry/error history, and test-notification controls remain guarded by Vite's development mode and are absent from the production UI.

`SOCKET_ALLOWED_ORIGINS` accepts exact, comma-separated canonical HTTP(S) origins, for example:

```dotenv
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
SOCKET_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

If not specified, the Socket.IO allowlist uses `FRONTEND_URL`. Programmatic `allowedOrigins` overrides the environment setting for isolated tests/integration. Empty lists, `null`, wildcards (including wildcard hostnames), credentials, paths, query strings, fragments, and trailing slashes are rejected as invalid configuration. Origins must match exactly, including scheme and port. CORS uses this same explicit list with GET/POST and credentials disabled. `allowRequest` also rejects unapproved browser origins for both polling and WebSocket handshakes, since browser CORS alone does not protect WebSocket handshakes. Missing Origin is reserved for native/local clients; the literal `Origin: null` is rejected.

The REST API retains its existing independent `FRONTEND_URL` configuration; adding a Socket.IO origin does not change REST authorization or credentials policy. See [Socket.IO server options](https://socket.io/docs/v4/server-options/).

## Input, size, rate, and event protections

Shared limits and safe public error messages live in `shared/network-policy.json` and `shared/network-errors.json`.

| Protection | Implemented behavior |
| --- | --- |
| Transport size | `maxHttpBufferSize = 8192` bytes. Oversized polling/WebSocket packets disconnect the sending transport. Compression extension is disabled. This is a transport-message limit, not a claim about all possible fragmented/binary aggregate allocations. |
| Application size | UTF-8 JSON serialization of the event name and non-callback arguments must be at most **4096 bytes**. Larger decoded events receive `PAYLOAD_TOO_LARGE` without echoing input. |
| Rate | **20 incoming application events per socket in a rolling 10-second window**, including invalid/unknown events. A monotonic clock avoids wall-clock adjustments. A bounded queue avoids fixed-window boundary bursts; no per-socket interval timer is needed. |
| Event allowlist | Clients may request only `network:ping`, `network:message`, or development `notification:test:request:v1`. Unsupported event names are rejected. |
| Server-only events | Client attempts to publish notification or payment outcomes receive `FORBIDDEN_EVENT`. Count/error broadcasts cannot be injected by clients. |
| Payload shape | Ping/test requests require exactly an empty plain object. Messages require one nonblank string of at most 500 characters. Arrays, null, primitive/binary empty objects, and extra fields fail. |
| Notification contracts | Version/type/identifier/timestamp/message/reference validation is preserved and now also requires plain objects and own required properties. Inherited fields cannot satisfy a contract. |
| Private access | No client recipient selection or room-join event exists. Forged handshake user IDs are ignored. Test notices use `socket.emit` only to the originator; financial publication never uses global broadcast. |
| Acknowledgments | Frontend timeouts must be finite integer values from 1 to **5000 ms**. Disconnected requests are rejected; there is no automatic application-request retry. |

`PAYLOAD_TOO_LARGE` is an application rejection. Transport-size violations may disconnect without an acknowledgment. Rate-limited clients receive a small static error; invalid input is never reflected in error messages or logs. Test simulation is explicitly rejected outside development/test independently of transport initialization.

## Financial publisher and future authentication

The existing publisher stores trusted identities in a private WeakMap after a supplied server-side authentication callback verifies them. It does not trust `handshake.auth.userId`, `socket.data`, client rooms, or the sample frontend identity. It reauthorizes each matching live session before delivery and removes the identity when that socket disconnects. Missing either adapter disables financial delivery completely.

M3-04 bounds each authentication/authorization adapter wait to **five seconds** using `verifyWithDeadline`. Adapters receive an AbortSignal: `authenticateSocket(socket, {signal})` and `authorizeNotification({socket,userId,event,notification,signal})`. Existing callback signatures remain compatible if they ignore the added argument. The provider must honor the signal to cancel its underlying I/O; this module can bound its own wait but cannot forcibly stop arbitrary provider work. Authorization deadlines apply per session, not to an entire multi-session publish call.

Invalid identities or thrown authentication errors yield only `Authentication required.` with structured data `{code:"AUTH_REQUIRED",retryable:false}`. Unavailable/timed-out verification uses `{code:"AUTH_UNAVAILABLE",retryable:false}`. Even non-Error thrown values are handled safely. No original exception, token, session, or database detail is sent to the client. Authorization failures/timeouts emit nothing to that denied session and return the existing generic publisher failure result. Partial delivery to earlier authorized sessions remains possible as documented in NETWORKING.md; do not blindly retry it.

Member 2 must supply real signature/session verification, expiration and revocation checks, stable trusted user IDs, and transaction-specific recipient authorization from committed server data. Never implement an adapter that merely returns a user ID submitted by a client. Credentials must be refreshed through real authentication before an explicit reconnect. Account-switch/logout cleanup and revocation-triggered socket termination still belong to that integration. No authentication implementation was added by this task.

## Connection manager and resilience

`frontend/src/services/connectionManager.js` is the sole owner of application lifecycle state and listeners on the shared socket. The React hook uses `useSyncExternalStore`, so status, ID, population, transport, error history, and retry state all derive from one snapshot. Notification subscription deduplication remains in the existing notification listener.

- Temporary transport errors use Socket.IO exponential reconnection backoff: initial **500 ms**, maximum base delay **5000 ms**, **0.5 jitter**, and at most **8 attempts** per recovery sequence. Exact scheduled delays vary with jitter. There is no tight immediate retry loop.
- Exhaustion exposes a clear state and requires explicit Connect. Merely mounting another consumer while the shared manager is exhausted does not restart it.
- Permanent authorization rejection, non-retrying middleware errors, and server-directed disconnect stop reconnection. Additional consumers cannot silently override a blocked connection. An explicit Connect is an intentional retry after access has been checked; it does not refresh credentials or prove authentication.
- Explicit Disconnect pauses recovery. Reference-counted consumer releases are idempotent, so repeated cleanup cannot decrement below zero or disconnect another active consumer.
- Transport-upgrade listeners are detached on disconnect/replacement. Socket, manager, React subscription, notification, and uptime timer listeners are removed by their owning cleanup paths. Hot-module disposal closes the old manager and socket.
- Disconnect clears socket ID, client count, transport, and the current uptime origin. A successful reconnect resets the uptime origin, refreshes the ID/count/transport, and clears the active connection error; bounded recent-error history remains available.

See [Socket.IO client options](https://socket.io/docs/v4/client-options/) and [client lifecycle API](https://socket.io/docs/v4/client-api/). The immutable policy is copied before passing it to Socket.IO because the library mutates its options.

### Requests and cancellation

`socketRequest.js` rejects unsupported request names and invalid timeout settings before emitting. It converts unknown/malformed acknowledgment errors to a fixed public error and never trusts a server-provided free-form message. Synchronous serialization failures also become a safe validation error. Timeout/disconnect/cancellation paths remove owned listeners. Cancellation removes only its request's buffered packet and timed acknowledgment callback; a concurrent request by another consumer is preserved.

Immediate callback/timer cancellation uses Socket.IO 4.x's `ids`, `acks`, and `sendBuffer` fields in one helper. These are implementation details rather than a stable public cancellation API. Keep the real-socket cancellation/parallel-request regression tests when upgrading socket.io-client; do not scatter such access elsewhere. This is a compatibility limitation, not an authorization mechanism.

### Server cleanup and logging

Disconnect removes this module's request handlers, clears its limiter queue, removes its socket-error listener, and updates the population after Socket.IO removes the socket. Socket.IO removes room membership; the publisher removes its trusted identity. In-flight provider waits are bounded. Middleware closures are garbage-collected with the socket; no private Socket.IO middleware arrays are mutated or unrelated listeners removed.

Application logs contain static lifecycle/error text and population counts only. They do not record socket/user IDs, IP addresses, Origin strings, event names supplied by clients, payloads, credentials, or raw exception text. The frontend retains at most ten sanitized network errors and 100 event-log entries; it never displays raw connection error messages. The health panel shows uptime, current transport, retry state, measured RTT and diagnostics context only in development.

## Tests and verification

Run from the existing project directories:

```powershell
cd E:\PayNet\backend
npm.cmd test
npm.cmd run lint
cd E:\PayNet\frontend
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run build
npm.cmd test
```

Browser tests need the development backend/frontend running and the repository's configured Edge installation. All new backend security tests bind isolated localhost ports; no external server or uncontrolled load is tested.

`backend/tests/security.test.js` covers malformed configuration, exact accepted/rejected origins on polling and WebSocket, CORS preflight, application/transport size limits, sliding-window boundaries, per-socket isolation, financial/room/count spoofing rejection, malformed/binary input, private log redaction, disconnect handler/room cleanup, verification timeout, real permanent authentication rejection, primitive provider failures, timeout settings, error-message sanitization, and cancellation preserving another request.

`frontend/unit/connectionManager.test.js` covers shared connections, idempotent releases, transport upgrades, count validation, uptime origin, retry state, permanent errors, retry exhaustion, bounded error history, listener ownership, server disconnect, and policy values. Browser security tests verify health fields, manual recovery, and safe rendering/blocked retry state. Browser authorization-error injection is local to the test page's event emitter; it creates no credentials or fake login. Existing real-server tests verify that actual adapter rejection has the same effect.

See [NETWORK_TESTING.md](./NETWORK_TESTING.md) for final executed counts and the complete earlier multi-client/reliability matrix.

Validation on 2026-11-11: **44 backend**, **15 frontend unit**, and **15 browser tests passed**, including all prior regressions. Both lint commands and the production build passed. No external endpoint or full load/performance run was needed for M3-04; the earlier bounded performance infrastructure remains covered by its automated tests.

## Known limitations and production deployment considerations

- Development-only initialization is a deliberate boundary. Do not enable the demo in production to obtain financial notification delivery. A separately reviewed authenticated deployment path is still required.
- Origin validation does not authenticate native clients, and credentials are currently disabled in Socket.IO CORS. Future cookie-based sessions require explicitly scoped credentials/CSRF/SameSite and origin decisions by the authentication owner.
- Limits are per process and per socket. Reconnecting resets the event allowance; there are no IP-wide quotas, global connection limits, distributed abuse protection, or hardened public reverse proxy here. Do not expose this development server to untrusted networks.
- Packet/application limits reduce exposure but are not full streaming, parser, or fragmented-attachment resource controls. There is no claim of defense against all malformed protocol frames, slow clients, or denial of service.
- Production needs TLS/WSS, trusted proxy configuration, compatible heartbeat/upgrade timeouts, restricted logging/monitoring retention, credential/session revocation, service-wide connection/admission limits, and tested distributed routing if deployed across processes. Do not bypass authentication middleware during connection-state recovery.
- There is no durable notification store, outbox/replay, exactly-once delivery, real account unread state, or financial reliability guarantee. A Socket.IO acknowledgment does not prove a payment or database commit.
- Verification deadlines and retry timers depend on a responsive JavaScript event loop. Providers that ignore cancellation can keep their own work alive; the authentication owner must use cancellable I/O.

## M3-04 file inventory

Created: `shared/network-policy.json`, `shared/network-errors.json`, `backend/socket/config.js`, `backend/socket/validation.js`, `backend/services/verificationDeadline.js`, `backend/tests/security.test.js`, `frontend/src/services/connectionManager.js`, `frontend/src/components/NetworkHealth.jsx`, `frontend/unit/connectionManager.test.js`, `frontend/tests/security.spec.js`, and this document.

Modified: `backend/server.js`, `backend/socket/index.js`, `backend/socket/handlers.js`, `backend/services/notificationContracts.js`, `backend/services/notificationPublisher.js`, `backend/testing/networkHarness.js`, `backend/.env.example`, `frontend/src/services/socket.js`, `frontend/src/services/socketRequest.js`, `frontend/src/services/notificationListener.js`, `frontend/src/hooks/useNetwork.js`, `frontend/src/pages/NetworkDemo.jsx`, `frontend/src/components/NetworkDiagnostics.jsx`, `docs/NETWORKING.md`, and `docs/NETWORK_TESTING.md`.

No new dependencies, commits, or pushes. Earlier uncommitted M3-01 through M3-03 files remain preserved; Git still lists these directories as untracked relative to the branch's initial `.gitignore`-only baseline.
