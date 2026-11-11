# PayNet: payment integration preparation checklist

## Current integration acceptance checklist

The original committed preparation document is preserved below as historical
context. Its missing-backend/PostgreSQL assumptions are superseded here:
`43f4e32` supplies a MongoDB backend with real session verification, wallets,
transactional virtual transfers and persisted notification APIs. Integration
work is on `integration/payment-networking`, without merging or changing main.

- [x] Reuse verified HttpOnly session authentication for `/payments`; verify
  revocation and ownership again before delivery. Server selects private rooms.
- [x] Use the existing versioned publisher, scoped to `/payments`, as the sole
  financial event path. Root financial delivery remains disabled by default.
- [x] Publish only after Member 2's transaction completes. No balance mutation
  or client-created payment event is exposed through Socket.IO.
- [x] Preserve pending transfer AND development-funding inputs/keys in
  account-scoped sessionStorage before HTTP emission. A storage failure prevents
  emission. Logout, reload and reauthentication do not clear unresolved keys.
- [x] Retain keys after transport loss, timeouts, 401, 403, 429, unexpected 409,
  server errors and malformed success bodies. Retrying uses the same input/key.
- [x] Clear only on validated completed transaction responses or persisted
  `FAILED` outcomes with a transaction reference and a known terminal code:
  `INSUFFICIENT_FUNDS`, `SELF_TRANSFER`, `RECIPIENT_UNAVAILABLE`, `WALLET_LIMIT`,
  `DEMO_FUNDING_LIMIT`. A plain HTTP status is not authoritative reconciliation.
- [x] Cancel old notification requests and reject obsolete identity/generation
  responses; reset pagination and unread state on account changes.
- [x] Reconcile authenticated API state after reconnect; deduplicate canonical
  notification IDs in the active listener lifecycle. Bound reconnect retries
  and block permanent authorization failures.
- [x] Execute unit, networking, browser and real isolated replica-set tests for
  retries, concurrency, failed outcomes, recipient privacy and revocation.
- [ ] Member 2 agreement on a lookup-by-idempotency-key recovery API. None was
  invented here. Until available, unresolved attempts must remain pending.
- [ ] Durable transactional outbox, replay cursor, and cross-process deduplication.
- [ ] Deployment-specific security and multi-instance end-to-end verification.

### Canonical persisted-outcome events

Names come from `shared/notification-events.json`; both sides validate their
contracts. All envelopes contain `version: 1`, persisted notification `id`,
`type`, nonempty `message` (maximum 500 characters), ISO `timestamp`, and
`transactionRef` (database transaction ID, not the human-readable PN reference).
Unknown fields and mismatched types are rejected. No balance or recipient ID
is exposed in the payload.

| Contract constant | Type | Use |
| --- | --- | --- |
| `EVENTS.PAYMENT_COMPLETED` | `payment.completed` | Committed virtual transfer outcome, each authorized recipient separately |
| `EVENTS.PAYMENT_FAILED` | `payment.failed` | Persisted failed attempt, initiating account only |
| `EVENTS.NOTIFICATION` | `info` | Committed development-funding SYSTEM notice |

Example passed by `backend/socket/payments.js` to the scoped publisher:

```js
await namespace.notificationPublisher.publishToUser(String(notification.userId), event, {
  version: 1, id: String(notification._id), type,
  message: notification.message,
  timestamp: notification.createdAt.toISOString(),
  transactionRef: String(transaction._id),
});
```

This is a server-side integration seam, never a client request. Replay of an
idempotent HTTP request returns the persisted result without republishing.
Socket delivery is not durable; missed events are recovered by authenticated
API reads, not a guaranteed socket replay.

### Execution matrix

Available now and executed: real isolated MongoDB replica-set API/database
tests; two authenticated users; successful/failed/concurrent transfers;
same-key replay; logout/revocation; private canonical delivery; reconnection;
cross-account pagination privacy; lost committed responses followed by 401 or
429 and reauthentication for both transfer and funding. See
[PAYMENT_NETWORKING_VERIFICATION.md](PAYMENT_NETWORKING_VERIFICATION.md).

Still requires Member 2/deployment work: lookup-based resolution of nonterminal
requests, durable outbox/replay tests, multi-node delivery, real deployment
configuration and operational failure recovery. No real banking is implemented.

---

## Preserved original preparation checklist

Prepared on **2026-11-11**, branch **feature/payment-integration**, from networking merge `bff9169`. The working tree was clean before this preparation. M3-01 through M3-04 are merged; Member 2's real PostgreSQL/authentication/wallet/payment implementation is not available here.

This is an integration contract and test plan, not a payment implementation. No financial transaction, JWT bypass, schema, wallet operation, production gate change, or new runtime financial event has been added. Default financial delivery must remain disabled. Read [TEAM_INTEGRATION.md](./TEAM_INTEGRATION.md) for existing integration examples and [NETWORK_SECURITY.md](./NETWORK_SECURITY.md) for security boundaries.

## 1. Existing networking interfaces — use these exact seams

| Existing interface | Required Member 2 contribution | Acceptance criteria |
| --- | --- | --- |
| `backend/server.js`: `createPayNetServer(options)` → `{app,server,io}` | Supply the two real callback functions through the existing option names below. Preserve the shared HTTP server. | Use `server.listen`; do not add a second `app.listen` or duplicate Socket.IO server/publisher. |
| `authenticateSocket(socket, {signal})` | Verify the actual JWT/session, map to a trusted active user, and return `{userId:string}` or reject. | No identity from client user/room fields or sample UI data; use the actual verifier supplied by Member 2. |
| `authorizeNotification({socket,userId,event,notification,signal})` | Verify the current session and this user's permission for the outcome/reference. | Return exactly `true` only for an allowed recipient/session; false excludes that session. Verify expiration/revocation again at delivery. |
| `backend/services/notificationContracts.js`: `EVENTS`, `validateNotification(event,payload)`, `validId(value)` | Map committed outcome records to the existing version-1 envelope. | Canonical trusted string IDs, matching event/type, fixed allowed fields and minimal text. |
| `io.notificationPublisher.publishToUser(userId,event,payload)` | Call from the trusted post-commit/outbox owner, once per authorized recipient/outcome. | No global financial broadcast; no call from a client-created payment event. |
| `frontend/src/services/socket.js`: `getNetworkSocket`, `getNetworkConnectionManager`, `retainNetworkSocket` | Supply real credentials through an authenticated lifecycle and use the existing shared connection. | Current service is development-only. Re-handshake after credential/identity change; clean up on logout. |
| `frontend/src/services/notificationListener.js`: `subscribeNotifications(socket,receive,{authenticated:true})` | Connect validated notices to a real authenticated notification store once it exists. | This flag selects contracts, not authorization. Never mix real financial notices into sample/test data. |

No PostgreSQL payment route, repository method, ORM, transaction API, token-refresh method, or notification-history endpoint exists in this networking contract. Member 2 must identify their **actual** entry points and response contracts before those paths are connected; do not invent placeholder APIs or claim they are ready.

### Required handover from Member 2

- [ ] Real JWT/session verifier binding, allowed algorithm/issuer/audience, trusted key configuration, expiration and revocation policy; no secrets in the document or Git.
- [ ] Canonical mapping from verified identity to database user ID. Existing `validId` accepts a **string** of 1–128 ASCII letters, digits, underscores or hyphens. UUIDs/trusted decimal IDs as strings fit; arbitrary email/URL subjects may not.
- [ ] Recipient authorization rules for sender, recipient, failed attempts, multiple sessions and revoked/disabled users. Do not assume both parties can see every failure.
- [ ] Actual payment request/service interface, authorization rules, idempotency-key scope, success/rejection responses, and authoritative status lookup/reconciliation after ambiguous outcomes.
- [ ] Successful-commit boundary for publication, committed transaction reference, outcome timestamp, authorized recipient IDs and a stable persisted notification ID per recipient/outcome.
- [ ] Durable notification/outbox workflow if required: ownership, retry/claim policy, deduplication, persistence and authenticated catch-up/read APIs. No schema work is performed by Member 3 here.
- [ ] Real authenticated frontend state, credential refresh, logout/account-switch cleanup and user-visible pending/confirmed/failed/unknown statuses.
- [ ] An isolated test database, migrations/fixtures and valid test credentials maintained by Member 2. They are prerequisites for the deferred cases below, not bypasses to enable now.

## 2. Authenticated Socket.IO connection requirements

- [ ] Supply **both** callbacks to `createPayNetServer({authenticateSocket,authorizeNotification})`. Otherwise the default publisher stays disabled and returns `FINANCIAL_NOTIFICATIONS_DISABLED` without emission.
- [ ] Within the real callback, read the proposed credential from `socket.handshake.auth.token`; verify signature and configured claims before trusting any subject. Decoding alone is not verification. Check active user/session and revocation.
- [ ] Return `{userId}` from verified server data only. Never accept `handshake.auth.userId`, a client-selected recipient/room, a fake JWT, or the frontend sample user as proof of identity.
- [ ] Honor the supplied AbortSignal. Existing networking waits at most **five seconds per verification call**; timing out its wait cannot forcibly cancel a provider that ignores the signal.
- [ ] Register financial listeners once at authenticated application scope **before** connecting. Use the existing unsubscribe cleanup on logout, identity change or unmount; do not create another socket for each page.
- [ ] The development AppProvider may already hold an anonymous demo connection. Disconnect through `getNetworkConnectionManager().disconnect()`, set the real `getNetworkSocket().auth = {token: accessToken}`, then call the manager's `connect()`. Updating `auth` on an existing live connection alone does not reauthenticate it.
- [ ] Clear credentials, private notification state and prior subscriptions on logout/account switch; authenticate the new identity before reconnecting. Do not append private notices to `initialNotifications` or the separate test feed.
- [ ] Preserve safe rejection: `AUTH_REQUIRED` for invalid identity/verification failure, `AUTH_UNAVAILABLE` for verification timeout, both `retryable:false`. No raw verifier/database error or token may reach logs/UI. Refresh credentials using the real auth flow before an explicit reconnect.
- [ ] Preserve temporary-failure recovery (500 ms initial base / 5-second maximum base, jitter, eight attempts) and permanent-rejection stop behavior. Do not implement an infinite retry or authorization bypass.
- [ ] Keep exact origins, 8 KiB transport / 4 KiB event limits, 20-event rolling 10-second rate limit, input/event allowlists and bounded acknowledgments enabled.

Production/staging currently return `io === null`; the frontend socket service and demo are development-only. Real local integration should use the existing development/test environment and real test credentials. Production transport/frontend enablement requires a separate review; do not remove guards or enable fake authentication to make integration tests pass. Socket.IO CORS currently has credentials disabled; a future cookie-based design needs its own reviewed origin/CSRF/cookie policy.

## 3. Verified user-specific delivery, rooms and privacy

**Current implementation:** the publisher authenticates sockets through its supplied callback, stores verified identities in a private WeakMap, matches the requested trusted `userId`, reauthorizes each live session and uses direct `socket.emit`. Named per-user rooms are **not implemented**, and private publishing does not require them. Socket IDs are temporary debug identifiers, not database user IDs.

**Optional future room association:** use the existing server-only example in [TEAM_INTEGRATION.md](./TEAM_INTEGRATION.md), after real identity verification. Associate the connected socket with `user:<verifiedUserId>`, never a client-submitted room name. Socket.IO removes membership on disconnect; reconnect must verify again. The room is a routing aid, not a permission check. Do not replace `publishToUser`/per-session authorization with unconditional room emission, and never add a public join/subscribe command.

Privacy acceptance checklist:

- [ ] Two valid users cannot receive each other's notices, including when one knows a transaction ID or room name.
- [ ] Every recipient is derived from committed server records and policy, not a request-body recipient field alone.
- [ ] Same-user tabs/devices may each receive one notice; unrelated users receive none. Multiple sessions are intentional, not automatically a duplicate-payment bug.
- [ ] Revoked sessions are denied during delivery and terminated according to Member 2's session policy, even if they remain connected/in a room temporarily.
- [ ] Test notices remain fixed, nonfinancial and originator-only. No global private/financial broadcast is introduced.
- [ ] Notices contain no balances, credentials, account details or unnecessary private information. Store/read private history only through authorized backend interfaces.

## 4. Outcome and payload agreement

Use `shared/notification-events.json` through the actual exported `EVENTS`:

| Event constant | Wire event / required type | When allowed |
| --- | --- | --- |
| `EVENTS.PAYMENT_COMPLETED` | `payment:completed:v1` / `payment.completed` | Only a confirmed committed successful outcome from Member 2's trusted backend. |
| `EVENTS.PAYMENT_FAILED` | `payment:failed:v1` / `payment.failed` | Only a verified final failure/rejection that policy permits this user to see; never inferred from a missing networking acknowledgment. |
| `EVENTS.NOTIFICATION` | `notification:v1` / `info` | Authorized user-specific informational notice, not a substitute for proving payment success. |

Required own fields are `version:1`, `id`, `type`, `message`, `timestamp`; optional `transactionRef` is recommended as a required **integration policy** for payment outcomes but is not made mandatory by the current validator. IDs/references use `validId`. Timestamp must be canonical UTC ISO with milliseconds; message must be nonblank and at most 500 characters. Extra fields are rejected. Keep exact version-1 fields; if ordering/revision metadata is needed, agree and test a versioned contract change rather than silently adding fields the validator rejects.

Minimal post-commit call shape, using existing code only:

```js
const { EVENTS, validateNotification } = require('./services/notificationContracts');
// Inside Member 2's trusted post-commit workflow, after the outcome is confirmed:
// recipientUserId and payload must come from authoritative persisted records.
if (io && io.notificationPublisher.enabled &&
    validateNotification(EVENTS.PAYMENT_COMPLETED, payload)) {
  const result = await io.notificationPublisher.publishToUser(
    recipientUserId, EVENTS.PAYMENT_COMPLETED, payload,
  );
  // Hand result to the future delivery workflow, independently of payment status.
}
```

Here `io` is the existing server-factory result, and `payload`/`recipientUserId` are bindings to Member 2's real persisted data, not fabricated fixtures or new API names. Invalid/disabled/skipped publication must be recorded for reconciliation by the eventual workflow, not silently treated as successful delivery. Do not add an HTTP or client Socket.IO payment-completion endpoint to call this code.

## 5. Exact integration sequence after a PostgreSQL commit

1. **Wire the real adapters first.** Keep the existing disabled-default behavior until both verified callbacks and real recipient rules are available. Re-run isolation/security tests before using real authenticated local sessions.
2. **Process the payment in Member 2's existing backend.** Authenticate the request, validate it, enforce business/idempotency rules and execute the actual database transaction there. Member 3 supplies no wallet mutation or SQL here.
3. **Persist authoritative outcome and delivery identity.** Member 2 should agree one stable notification ID per transaction/outcome/recipient and, for crash-safe dispatch, a durable outbox record committed with the successful payment. This is a dependency/design requirement, not a schema change made by this task.
4. **Wait for successful commit confirmation.** Do not emit success after a validation check, an in-progress query, or a commit attempt that has not resolved successfully. PostgreSQL transactions group changes atomically; the publication boundary follows the committed outcome. See [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html).
5. **Read/construct the notice from committed data.** Select the permitted recipients, event/type, stable notification ID, timestamp and transaction reference. Validate using `validateNotification`. No recipient, room or claimed success comes directly from a client.
6. **Publish through one trusted owner.** Invoke `io.notificationPublisher.publishToUser` once per authorized recipient/outcome, or let the future outbox dispatcher do so. Do not publish independently from both the request handler and dispatcher. Per-session authorization still runs at emission time.
7. **Keep payment truth separate from delivery.** A committed payment remains committed if no socket is online, the publisher is disabled, authorization denies a session or emission fails. Record/retry/reconcile delivery through the future workflow; do not roll back or report the payment failed because the socket path failed.
8. **Reconcile uncertain and missed outcomes.** If a commit/network result is ambiguous, do not invent success or failure or repeat wallet mutations. Member 2 must resolve the authoritative status using the same idempotency identity. Offline clients require future authenticated persisted-history/catch-up; reconnect alone does not replay notices today.

### Failure rules

- A validation rejection, rollback, deadlock/serialization abort or failed commit must not generate `payment:completed:v1` for uncommitted work.
- A `payment:failed:v1` notice needs a confirmed final business failure and an authorized recipient. A rollback does not automatically create a durable failure record; if the team persists one, it needs its own valid persistence boundary. Do not publish success/failure notices from rolled-back outbox data.
- An acknowledgment timeout, disconnected tab, unavailable publisher or uncertain commit is **not** proof of payment failure. Reconcile instead of guessing. Do not notify an intended receiver about a rejected sender attempt unless the real privacy policy explicitly permits it.
- Publisher `ok:true,delivered:N` counts emissions, not durable client receipt. `delivered:0` may mean offline/no authorized sessions. False authorization excludes a session. Exceptions/timeouts may return `AUTHORIZATION_FAILED` after partial emission; the result has a count, not a list of acknowledged sessions. `INVALID_NOTIFICATION` and `FINANCIAL_NOTIFICATIONS_DISABLED` must remain fail-closed.

## 6. Duplicate-event prevention and idempotency

These are separate requirements; frontend deduplication does not make a payment idempotent.

- [ ] **Payment-request idempotency:** Member 2 defines an authenticated scope/key, concurrency-safe claiming, payload consistency, retry response and retention policy. The same logical request must not debit/credit twice, including simultaneous retries or a lost HTTP response. Reject reuse with different payment parameters according to the agreed contract.
- [ ] **Stable outcome identity:** persist/reuse the notification ID per transaction/outcome/recipient, including worker retries. Do not generate a fresh random ID each time the same outcome is dispatched. Separate recipient envelopes/IDs are allowed and should follow an agreed rule.
- [ ] **Single dispatch owner:** choose request-post-commit or outbox ownership explicitly. If using an outbox, Member 2 must define safe worker claiming, bounded retries and recovery. No claim/uniqueness schema is implemented here.
- [ ] **Crash gaps:** cover crash before commit, after commit before emission, and after emission before dispatch bookkeeping. A plain post-commit emit alone cannot guarantee crash-safe delivery. Preserve the same ID when a retry may repeat an emission.
- [ ] **Client deduplication:** the existing listener remembers only the latest **200 IDs per event per active subscription**. It is not durable across reload/logout and is not an exactly-once guarantee. The sample test feed's separate 100-item cap is not a real financial history store.
- [ ] **Ordering/concurrency:** do not assume arrival order across concurrent committed transfers is the authoritative account order. Reconcile against committed data; if the team needs revisions/sequences, negotiate a new tested contract. Never derive a wallet balance by trusting notification arrival order.
- [ ] **Catch-up:** future authenticated history/cursor retrieval must reuse persisted IDs and prevent cross-user cursor/reference access. A duplicate socket notice must not repeat a transfer, mutate balances, or duplicate a persistent notification record.

Socket.IO's current transport delivery is not durable replay or exactly-once application processing. Additional guarantees need application persistence/idempotency; see [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).

## 7. Tests runnable now — existing coverage only

These tests use real isolated Socket.IO connections and, for publisher seams, isolated server-side test stubs. Such stubs exercise the interface; they are not application authentication or real financial transactions. They do not establish real JWT validity or database correctness.

| Existing tests | Runnable coverage | What they do not establish |
| --- | --- | --- |
| `backend/tests/network.test.js` | Health API, connect/count/disconnect, acknowledgments, invalid payloads, rate/origin restrictions, disabled production endpoint, restart recovery | Payment success, database atomicity or JWT verification |
| `backend/tests/multi-client.test.js` | 2/5/10/25 independent clients, exact counts, private nonfinancial notices, clean baseline restoration | Concurrent wallet correctness; 25 clients is a bounded network scenario, not transfer load |
| `backend/tests/notifications.test.js` | Contracts, disabled publisher, trusted-adapter targeting/denial, test notice privacy, forbidden client events, reconnect, production restrictions | Real users, credentials, financial commits or durable delivery |
| `backend/tests/reliability.test.js` | Transport loss, restart, acknowledgment timeout, rapid cycles, listener/callback cleanup, invalid traffic | Post-commit crash recovery or persisted catch-up |
| `backend/tests/security.test.js` | Sizes/origins/rates, private-room/financial/count spoofing rejection, safe errors/logs, verification deadlines, permanent rejection and concurrent-request cancellation | Real signature/revocation verification and transaction-specific authorization policy |
| `backend/tests/performance-safety.test.js` | Local-only configuration/limits and small real runner smoke test | Production throughput or payment performance |
| `frontend/unit/*.test.js` | Shared connection state, bounded retry, listener/deduplication/cleanup, latency statistics | Authenticated account switching or financial persistence |
| `frontend/tests/*.spec.js` | Existing UI/health, nonfinancial notices, RTT/health diagnostics, reconnect, safe blocked-access display | Actual payment outcome UI or authenticated financial delivery |

Existing anonymous `network-demo` flows remain safe to demonstrate now. Do not add a simulated financial-success button or connect a test stub to the running application.

## 8. Deferred real integration test matrix

**All cases in this table are planned, not implemented/executed by this task.** They require Member 2's real backend, isolated database/fixtures and real test credentials; history/outbox/revision cases additionally require those features. Member 3 owns Socket.IO assertions with Member 2 reviewing authoritative database/payment expectations.

| ID | Scenario / prerequisite | Required observable assertions |
| --- | --- | --- |
| AUTH-01 | Real valid JWT for two distinct users | Identity derives from verified server data; each socket belongs only to its trusted user; no client ID impersonation. |
| AUTH-02 | Missing, malformed, expired, bad-signature, wrong-issuer/audience or revoked JWT | Connection rejected safely; no private notice/membership; no infinite retry or token details in logs/UI. |
| AUTH-03 | Token expires or session is revoked while connected | Delivery authorization denies the session, session cleanup follows policy; a previously joined room cannot bypass it. |
| AUTH-04 | Logout/account switch, credential refresh and reconnect | Old connection/state/listeners cleared; fresh handshake verifies the new user; no old-user notice appears. |
| PAY-01 | A successful real transaction is held before commit, then committed | No completion event before commit; after confirmed commit only allowed users receive matching persisted IDs/reference; database outcome is authoritative. |
| PAY-02 | Actual validation/business rejection or rollback | No successful financial notification or partial committed wallet effect; any failure notice follows persisted failure/recipient policy. |
| PAY-03 | Commit acknowledgment becomes ambiguous due to connection failure | UI/workflow treats outcome as unknown/pending reconciliation; no invented failure/success and no duplicate mutation on retry. |
| PAY-04 | Database reports success, but socket is offline / publisher fails / session is denied | Payment remains successful; delivery result is separate; no leaked notice and later authorized history/catch-up if implemented. |
| IDEM-01 | Repeat the same request/key after a lost response | Exactly one logical committed payment and one persisted outcome per agreed recipient; retries reuse stable notification identity. |
| IDEM-02 | Simultaneous requests with the same key; same key with changed parameters | Concurrent deduplication follows Member 2's contract; no double debit/credit and no incompatible request silently treated as the original. |
| CON-01 | Two distinct valid transfers compete for the same source funds | Actual transaction/locking/isolation rules prevent forbidden overspend or partial effects; notifications match only confirmed committed outcomes. |
| CON-02 | Distinct concurrent transfers for one user or opposite directions | References/recipients remain correct; no unsupported ordering/balance assumptions; no lost or duplicated persisted outcomes. |
| CON-03 | Bounded multiple senders/recipients | No cross-user leakage; permitted multi-session delivery only; run controlled local fixtures, not uncontrolled load. |
| REL-01 | Disconnect/reconnect around a confirmed payment | Re-authentication occurs, live listener is singular, no transfer replay; missed notices require actual authenticated catch-up rather than automatic claims. |
| REL-02 | Crash after commit before dispatch; crash after dispatch before bookkeeping | If an outbox exists, committed work is recovered with the same IDs; duplicates do not repeat payment or persistent outcomes. |
| REL-03 | Outbox retry or worker concurrency / partial session emission | Single workflow ownership, bounded retries and stable IDs; do not blindly treat the publisher count as client acknowledgments. |
| REL-04 | Reload and authenticated history reconciliation after missed/duplicate notices | Persistent history is correct even after the in-memory 200-ID window is gone; other users' cursors/references are denied. |
| SEC-01 | User A guesses user B's room, user ID, transaction reference or replay cursor | No private data or membership is granted; recipient/history authorization is enforced from server data. |
| SEC-02 | Client emits completed/failed financial events, tries balance mutation or joins a private room | Existing rejection/allowlist remains intact; no backend state change or financial publication. Real backend authorization is checked in addition to existing network tests. |
| SEC-03 | True issuer-authorized users with malformed/oversized/flooded requests | Existing size/rate/origin protections remain; unrelated sessions remain usable; no sensitive log/error output. |
| UI-01 | Actual committed outcome, verified final failure, unknown status and duplicate notice | Authenticated UI reflects each authoritative state without claiming test/sample data are real; no duplicate toast/history from duplicate delivery. |

For each deferred case, record test ID, real fixture identities (without secrets), transaction/idempotency/notification references, server commit evidence, recipient emission evidence, expected denied recipients, cleanup outcome and actual result. Use barriers around real commit/dispatch rather than sleeps or arbitrary latency thresholds. Do not mark a case passed solely because an existing network stub test passes.

## 9. Ordered acceptance gates for Member 2 and Member 3

1. [ ] Agree actual interface names/data mapping and the ownership decisions in section 1; retain the disabled default until they exist.
2. [ ] Wire the real verification/authorization callbacks in development/test; pass AUTH-01/02 and privacy checks before using financial fixtures.
3. [ ] Establish the successful commit boundary and agreed stable IDs; pass PAY-01/02 with real isolated database evidence.
4. [ ] Resolve ambiguous outcomes/idempotency and concurrent requests; pass PAY-03, IDEM-01/02 and CON-01/02.
5. [ ] Wire one post-commit/outbox owner to the current publisher; distinguish payment status from delivery result. Pass PAY-04 and the relevant crash/retry tests before claiming durable delivery.
6. [ ] Integrate the authenticated frontend store and session lifecycle; pass AUTH-03/04, REL-01/04 and UI-01. Keep sample/test data separate.
7. [ ] Run all networking regressions plus the new real integration cases, verify cleanup/privacy, and record actual outcomes. Do not weaken guards to make a failing test green.
8. [ ] Review production transport/auth/session/TLS/origin/routing configuration separately. Current production guards remain unchanged.

## 10. Regression commands and current execution record

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

Backend tests need no database or running app server. Browser tests need the current backend/frontend dev servers on 5000/5173 and the repository's configured Windows Edge installation. Use separate `npm.cmd run dev` terminals if not already running. No controlled performance report needs to be overwritten for this documentation-only preparation; the backend suite already exercises its safe runner smoke test and multi-client scenarios.

Executed on **2026-11-11** for this preparation:

| Check | Actual result |
| --- | --- |
| Backend automated networking/security tests | **44 / 44 passed**, including existing multi-client and disabled-publisher tests |
| Frontend unit tests | **15 / 15 passed** |
| Existing browser tests | **15 / 15 passed** |
| Backend lint | Passed |
| Frontend lint | Passed |
| Frontend production build | Passed |

No networking regressions were observed. Browser tests used the existing local dev servers and configured Edge installation; build/browser execution required the environment's elevated tool permission. No real authentication/payment/SQL path was introduced to run these checks. No new dependencies or full performance-report replacement were needed.

Deferred real integration cases remain **not run / blocked on Member 2**, independently of the networking regression outcome. Completion requires actual backend evidence, not relabeling stub/network tests as payment tests.

Files changed in this preparation: created `docs/PAYMENT_INTEGRATION_CHECKLIST.md`; updated `docs/TEAM_INTEGRATION.md` with a discovery link/current merge context. Runtime code, schemas, authentication, wallets, payment processing and security gates are unchanged. No commit or push was performed.
