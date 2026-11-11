# PayNet networking: team integration handover

> Historical M3 handover. Task 04 now implements authenticated virtual payments and
> the connected frontend. Use [backend/README.md](../backend/README.md) and the
> root README for current startup, API and `/payments` namespace instructions.
> The descriptions below of missing payment/authentication work refer to the M3 snapshot.

**Status:** M3-01 through M3-04 are implemented and verified. Networking works independently of the database and unfinished payment APIs. The [MongoDB foundation](./MONGODB.md) now provides connection configuration, models and transaction infrastructure. This handover does not claim authenticated payments or banking integration. Read [FINAL_NETWORKING_VERIFICATION.md](./FINAL_NETWORKING_VERIFICATION.md) for the historical networking checks and Git review, [NETWORKING.md](./NETWORKING.md) for protocol details, and [NETWORK_SECURITY.md](./NETWORK_SECURITY.md) for security boundaries.

## Architecture and entry points

```text
React /network-demo and development notification provider
  -> one socket service + connection manager per tab
  -> Socket.IO polling / WebSocket on the Express HTTP server
  -> validation, byte/rate limits, request handler, acknowledgment
  <- counts, private nonfinancial test notice, safe errors

Future Member 2 integration (not connected today):
verified JWT/session -> trusted user identity -> per-session recipient authorization
committed payment outcome -> publishToUser -> only that user's verified live sockets
```

| Actual entry point | Responsibility |
| --- | --- |
| `backend/server.js`: `createPayNetServer(options)` | Returns `{app, server, io}` without connecting a database or starting HTTP. HTTP liveness remains `/api/health`. |
| `backend/server.js`: `startPayNetServer(options)` | Connects/initializes MongoDB before listening (default port 5000); returns `{app, server, io, close}`. `close()` also disconnects MongoDB. |
| `backend/socket/index.js`: exported initializer | Attaches Socket.IO to that HTTP server and exposes `io.notificationPublisher`. |
| `backend/socket/config.js`: `createSocketConfig` | Development/test gate, exact origin list, transport limits. Production/staging return no Socket.IO server. |
| `backend/socket/events.js`, `handlers.js`, `validation.js` | Server-defined request protocol, shape/byte/rate validation, handlers and cleanup. |
| `backend/services/notificationContracts.js` | Exports `EVENTS`, `validateNotification(event,payload)`, and `validId(value)`. |
| `backend/services/notificationPublisher.js`: `createNotificationPublisher` | Installs supplied verification middleware and returns `{enabled,publishToUser}`. Normally installed by the initializer; do not install another publisher on the same server. |
| `backend/services/verificationDeadline.js`: `verifyWithDeadline` | Bounds a supplied verification operation and passes an AbortSignal. |
| `frontend/src/services/socket.js` | `getNetworkSocket`, `getNetworkConnectionManager`, `retainNetworkSocket`, `requestNetwork`; current service is explicitly development-only. |
| `frontend/src/services/connectionManager.js` | Shared lifecycle snapshot, bounded backoff, permanent-error handling and owned cleanup. |
| `frontend/src/services/notificationListener.js` | `NOTIFICATION_EVENTS`, `isNotification`, `subscribeNotifications`; validation and bounded ID deduplication. |
| `frontend/src/context/AppContext.jsx` | Existing sample UI data and a separate development test-notification feed/toast. Sample user/data are not authentication. |

Do not introduce another `app.listen` or another socket for each page. Preserve the `createServer(app)` wrapper and use `server.listen`. Keep `shared/` with both applications when packaging. Install with `npm.cmd ci` inside each app directory; there is no root package.json.

## Shared contracts and directions

Notification event names are centralized in `shared/notification-events.json`; protocol version is **1**. Limits and public messages are in `shared/network-policy.json` and `shared/network-errors.json`. Networking request constants remain in `backend/socket/events.js` and are mirrored by the frontend service.

| Event | Direction / payload |
| --- | --- |
| `network:ping` | Client → server: exactly `{}`, acknowledgment required; success includes `ok:true`, `message:"pong"`, `serverTime`. |
| `network:message` | Client → server: exactly `{message:string}`, nonblank and at most 500 characters; acknowledgment echoes trimmed sample text. |
| `network:clients` | Server → all development sockets: `{count}`. Counts sockets/tabs, not authenticated people. |
| `network:error` | Server → offending socket: fixed `{code,message}` when an application acknowledgment is absent. |
| `notification:test:request:v1` | Development client → server: exactly `{}`, acknowledgment required; no recipient or custom notification text accepted. |
| `notification:test:v1` | Server → originating socket only: `type:"test"`; never a payment outcome. |
| `notification:v1` | Future authorized server → specific verified user: `type:"info"`. Disabled in the default app. |
| `payment:completed:v1` / `payment:failed:v1` | Future authorized server → specific verified user: `type:"payment.completed"` / `"payment.failed"`. Disabled in the default app. |

Envelope example (a **contract illustration**, not a record of a real payment):

```json
{
  "version": 1,
  "id": "persisted-notification-id",
  "type": "payment.completed",
  "message": "A transaction update is available.",
  "timestamp": "2026-11-11T12:22:23.000Z",
  "transactionRef": "committed-transaction-id"
}
```

Required own fields are `version`, `id`, `type`, `message`, and `timestamp`; `transactionRef` is optional and forbidden for test notices. No other properties are accepted. IDs/references must contain 1–128 letters, digits, underscores, or hyphens. Timestamp is canonical UTC ISO with milliseconds. A plain object, matching version/type, and nonblank message of at most 500 characters are required. Use minimal text without balances, account details, or secrets. Clients cannot publish server-only events, choose financial recipients, update balances, or subscribe to private rooms.

## Member 2: JWT integration seam

No JWT verifier or signing library is installed as part of networking. Member 2 owns the real verification code, credential lifecycle, users, revocation and authorization. The following uses **existing option names**; the function-valued variables must be bound to Member 2's actual implementations before running it. It does not refer to a fabricated authentication API:

```js
// From a backend integration/bootstrap module:
const { createPayNetServer } = require('./server');
const { server, io } = createPayNetServer({
  authenticateSocket,       // Member 2 supplies this callback
  authorizeNotification,    // Member 2 supplies this callback
});
server.listen(5000);
```

Existing callback contracts:

```js
// authenticateSocket(socket, { signal }) -> Promise<{ userId: string }>
// authorizeNotification({ socket, userId, event, notification, signal })
//   -> Promise<true | false>
```

For a JWT handshake, obtain the credential from `socket.handshake.auth.token` in the real authentication callback. Treat it as untrusted until signature verification succeeds against trusted server configuration. Verify an explicit allowed algorithm, issuer, audience, expiry/not-before and subject, then check active user/session and revocation as required. Decoding JWT JSON is not verification. Never accept `handshake.auth.userId`, a selected room, or the sample UI user as identity. Return `{userId}` from verified server data only. The callback should throw/reject or return no identity when access is invalid.

The authorization callback must return exactly `true` only when the recipient may see this event/transaction and the session is still authorized. Return false for denial. It runs for each matching live session before every emission; knowing a transaction reference is not authorization. Check revocation/ownership here as well as at the handshake. Network verification has a five-second per-call deadline; honor the supplied signal to stop underlying I/O. See [JWT security best practices, RFC 8725](https://www.rfc-editor.org/rfc/rfc8725).

The returned `userId` must be a canonical string accepted by the existing `validId` contract: 1–128 ASCII letters, digits, underscores, or hyphens. UUIDs and trusted decimal database IDs represented as strings fit; an arbitrary email/URL subject may not. Coordinate that mapping with the real user schema rather than trusting or rewriting client identifiers.

Without **both** callbacks, `io.notificationPublisher.enabled` is false and publication returns `FINANCIAL_NOTIFICATIONS_DISABLED`. Production still returns `io === null` even with callbacks: do not remove that safety gate as a shortcut. A reviewed production transport/bootstrap and authenticated frontend lifecycle must be added separately.

### Frontend credential and listener handoff

The existing service supports setting Socket.IO's real `auth` property, but only in a development integration session. This fragment uses actual exports and assumes `accessToken` is supplied by Member 2's real authentication state:

```js
import { getNetworkSocket, getNetworkConnectionManager } from './services/socket';
const manager = getNetworkConnectionManager();
manager.disconnect();                 // replace any existing anonymous/demo connection
const socket = getNetworkSocket();
socket.auth = { token: accessToken }; // real verified credential flow, never a fake token
manager.connect();                   // new handshake; setting auth alone does not reauthenticate
```

Paths above are relative to a module in `frontend/src`. Run this through a real authenticated lifecycle effect, not on every render. The development AppProvider currently holds an anonymous demo connection, so disconnect/re-handshake when changing credentials. On logout/account switch, disconnect, clear credentials and all future private state, remove the prior listener, then authenticate the new identity before connecting again. Do not use the sample financial array as live authenticated data.

For a future real financial store, use the existing listener once at application/auth scope:

```js
import { subscribeNotifications } from './services/notificationListener';
const unsubscribe = subscribeNotifications(socket, (notification, event) => {
  // Map into Member 2's authenticated notification state when that state exists.
  // Do not log private payloads or append them to sample/test financial data.
}, { authenticated: true });
// Call unsubscribe() during logout, identity change, or owner unmount.
```

The `authenticated: true` option chooses listener event contracts; it does not authenticate or grant access. The default app never supplies it. Keep the single shared socket; use `retainNetworkSocket` only if creating a new lifecycle owner, and release its returned cleanup exactly once. Do not add per-page `io()` calls. Production currently cannot call `getNetworkSocket` because of its development guard.

## Private rooms: current behavior and optional future association

**Implemented today:** private delivery uses the publisher's private WeakMap of verified socket identities and direct `socket.emit`. Named per-user rooms are not implemented or required for this path. Socket.IO gives each connection its own socket-ID room automatically; that transient room is not an authenticated user identity. The existing publisher must remain the publication entry point.

**Optional future server-only association**, after Member 2 supplies the callbacks above: this shows where verified identities can be attached to user rooms without a client subscribe command. It is not installed in the running app. `authenticateSocket` and `authorizeNotification` below are the same existing callback bindings, not new repository APIs:

```js
const { createPayNetServer } = require('./server');
const { validId } = require('./services/notificationContracts');
const verifiedForRooms = new WeakMap();
const { server, io } = createPayNetServer({
  authenticateSocket: async (socket, { signal }) => {
    const identity = await authenticateSocket(socket, { signal });
    if (!identity || !validId(identity.userId)) throw new Error('Authentication required.');
    verifiedForRooms.set(socket, identity.userId);
    return identity;
  },
  authorizeNotification,
});
if (io) io.on('connection', (socket) => {
  const userId = verifiedForRooms.get(socket);
  if (!validId(userId)) { socket.disconnect(true); return; }
  socket.join(`user:${userId}`); // only from the verified server identity
  socket.once('disconnect', () => verifiedForRooms.delete(socket));
});
server.listen(5000);
```

Use this **instead of**, not in addition to, the first bootstrap example. Socket.IO automatically removes room membership on disconnect; reconnect must verify again. Do not add a client-controlled `join`, `subscribe`, or room-name endpoint. This room association does not change the current publisher and is not a permission check by itself. Do not replace per-session reauthorization with an unconditional `io.to(room).emit`: revoked sessions still need denial and termination. If the team later optimizes publication using rooms or adds a distributed adapter, keep equivalent ownership/revocation checks and extend the privacy/reconnect tests. See [Socket.IO rooms](https://socket.io/docs/v4/rooms/).

## Publish only after Member 2's MongoDB transaction commits

Payment processing is absent here. The [MongoDB foundation](./MONGODB.md) now supplies models, connection configuration and `withDatabaseTransaction`; Member 2 should invoke the existing publisher only after that helper's promise successfully resolves for a real authorized payment. Its callback may be retried, so publication must remain outside the callback. No Socket.IO handler should perform a transfer or trust a client assertion that a payment completed.

This fragment uses actual exports and the actual publisher. The three data bindings must come from committed server records, not request-body recipients or client-generated outcome events:

```js
const { EVENTS, validateNotification } = require('./services/notificationContracts');
// committedRecipientUserId, notificationId, committedTransactionRef, and committedAt
// come from Member 2's committed records. No COMMIT/payment API is invented here.
const payload = {
  version: EVENTS.VERSION,
  id: notificationId,
  type: 'payment.completed',
  message: 'A transaction update is available.',
  timestamp: committedAt.toISOString(),
  transactionRef: committedTransactionRef,
};
if (io && validateNotification(EVENTS.PAYMENT_COMPLETED, payload)) {
  const result = await io.notificationPublisher.publishToUser(
    committedRecipientUserId, EVENTS.PAYMENT_COMPLETED, payload,
  );
  // Record result in the future delivery/outbox workflow; do not roll back a
  // committed payment or tell a user payment failed because a socket is offline.
}
```

`ok:true,delivered:N` counts socket emissions, not durable client receipt. Zero means no matching authorized live session. Invalid envelopes return `INVALID_NOTIFICATION`. Disabled adapters return `FINANCIAL_NOTIFICATIONS_DISABLED`. Verification exceptions/timeouts return `AUTHORIZATION_FAILED`, potentially with a partial delivered count. A false authorization decision simply excludes that session. Different authenticated sessions for one user may each receive the notice; that is intentional.

### Avoid duplicate payment notifications

1. Persist one stable notification ID per committed transaction/outcome/recipient. Reuse it on retries; do not generate a fresh random ID every time a payment handler is retried.
2. Member 2 should design payment idempotency and, where durable delivery matters, an outbox entry committed with the payment. A post-commit emit alone has a crash gap. The MongoDB model/transaction foundation exists; payment logic and an outbox remain unimplemented.
3. Choose one server publication owner. Do not publish from both a REST response handler and a client acknowledgment, or from both a payment service and an independent listener without deduplication.
4. The frontend deduplicates the latest 200 IDs per event per live subscription, and the development test feed is separately capped at 100. This is bounded session-level protection, not database idempotency or exactly-once delivery. A reload may accept an ID again.
5. Reconnection does not replay missed messages today. Future persistence/read APIs and authenticated catch-up must use the same IDs. Do not blindly replay partial-success publication results to every session.

Socket.IO does not itself provide durable exactly-once application delivery; see [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).

## Authorization failure handling

Authentication errors expose only `Authentication required.` with `{code:'AUTH_REQUIRED',retryable:false}`; verification timeout uses `AUTH_UNAVAILABLE` and the same non-retrying flag. The manager stops automatic retry and shows a sanitized blocked-access state. Server-directed disconnect also stops retry. Real login/credential refresh is Member 2's responsibility; Connect is only an explicit handshake retry, not login.

Temporary transport failures retry with 500 ms initial base delay, 5-second maximum base, 0.5 jitter and an eight-attempt budget. Retry exhaustion needs explicit Connect. Explicit Disconnect pauses retry. Requests time out within five seconds, are not queued while disconnected, and are not automatically resent. Keep the real-socket cancellation tests when upgrading Socket.IO, because immediate callback cleanup uses isolated Socket.IO 4.x internals.

## Readiness checklist

- [x] HTTP + Socket.IO foundation, validated request/acknowledgment flow, health endpoint
- [x] Shared event contracts and fail-closed user-specific publisher interface
- [x] Nonfinancial, originator-only development notification and separate UI feed/toast
- [x] Shared React connection manager, retry/error handling, cleanup, RTT/chart/health demo
- [x] 2/5/10/25-client, privacy, security and restart tests; safe loopback performance script
- [x] Limits, origin policy, safe logging and production demo restrictions
- [ ] Real JWT/session verification, credential refresh and revocation policy — Member 2
- [ ] Real recipient/transaction authorization — Member 2
- [x] MongoDB configuration, models, indexes and session/transaction infrastructure
- [ ] MongoDB payment commit hooks, payment idempotency and durable outbox — Member 2
- [ ] Authenticated financial notification persistence/read/catch-up and account-switch state
- [ ] Optional verified-user rooms / distributed routing, with equivalent reauthorization
- [ ] Reviewed production Socket.IO initialization, TLS/WSS and authenticated frontend lifecycle

Keep existing demo/sample labels until genuine backend integration is complete. Use the regression commands in [FINAL_NETWORKING_VERIFICATION.md](./FINAL_NETWORKING_VERIFICATION.md) before integration and again after connecting the real callbacks.
