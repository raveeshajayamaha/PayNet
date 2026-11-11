# Member 3: PayNet networking presentation

Use the spoken script for approximately **4–5 minutes**, including short browser actions. The checklist and lecturer answers are preparation material, not additional script. Do not show a real payment or describe sample financial cards as live banking data.

## Before presenting

Start the two apps in separate PowerShell terminals:

```powershell
cd E:\PayNet\backend
npm.cmd run dev
```

```powershell
cd E:\PayNet\frontend
npm.cmd run dev
```

Use `npm.cmd ci` first in each directory on a fresh checkout. `.env.example` contains local settings; copy it only if `.env` does not already exist. Browser origin should be `http://localhost:5173`, matching backend `FRONTEND_URL` / `SOCKET_ALLOWED_ORIGINS`; Socket.IO URL defaults to `http://localhost:5000` through `VITE_SOCKET_URL`.

Open **two tabs** at `http://localhost:5173/network-demo`, close unrelated demo tabs for an easy-to-explain count of two, and keep the backend terminal visible. Open [FINAL_NETWORKING_VERIFICATION.md](./FINAL_NETWORKING_VERIFICATION.md) and the [raw performance report](./network-performance-results.json) as evidence. Do not run a browser load generator.

## Spoken script: approximately 4 minutes 30 seconds

### 0:00–0:30 — my contribution

“I am Member 3, responsible for PayNet's real-time networking, reliability, security, testing, and integration. I built this on the team's existing React interface and Express health API. My completed work covers the Socket.IO server and reusable client, notification contracts, diagnostics, multi-client testing, and network hardening. PostgreSQL, authentication, wallets, and payment processing remain Member 2's responsibility. This demonstration moves no money.”

### 0:30–1:00 — architecture and choice of Socket.IO

“The Express API and Socket.IO share one HTTP server on port 5000. Each browser tab owns one shared client connection. React pages subscribe to that connection rather than creating new sockets. Socket.IO gives us named bidirectional events, acknowledgments, reconnection, and polling-to-WebSocket transport handling. That lets our project demonstrate event-driven communication while still using REST where request/response operations are appropriate.”

### 1:00–2:10 — live event exchange and measurement

[Show both tabs, then use the first tab.]

“These tabs have separate socket IDs, and the client count reports both connections. I will ping the server. The server validates the request and returns a pong acknowledgment with its timestamp. A sample text message also receives an acknowledgment; this is communication testing, not a transaction.

“Now I will select Run Latency Test. It sends ten paced pings on the same connection. The chart and cards show minimum, maximum, mean, median, and p95 application round-trip latency. We measure elapsed time with a monotonic clock. This includes application processing and scheduling; it is not one-way delay.”

[Wait for ten samples.]

“Next I send a nonfinancial test notification. Only this tab receives a toast. The other tab receives nothing. Its feed is separate from the interface's sample financial notifications.”

### 2:10–2:45 — recovery and health

[Briefly stop the backend, then restart it promptly.]

“The health panel shows status, transport, uptime, retry state, and sanitized errors. A temporary outage triggers reconnection with backoff. After recovery the socket ID changes and uptime restarts. Explicit Disconnect instead pauses recovery until Connect is selected. Permanent authorization rejection stops automatic retries, and temporary failures have an eight-attempt budget.”

### 2:45–3:20 — test and performance evidence

“Automated tests cover two, five, ten, and twenty-five independent clients, exact counts, private delivery, clean disconnects, server restart, timeouts, and listener cleanup. Final validation passed forty-four backend tests, fifteen frontend unit tests, and fifteen browser tests.

“The final bounded local run connected all twenty-five clients and acknowledged all two hundred and fifty pings, with no failures or timeouts and zero sockets left after cleanup. Average application RTT was 10.025 milliseconds and p95 was 25.545 milliseconds. These are same-machine results, not a production capacity benchmark.”

### 3:20–4:00 — security boundaries

“Only exact configured browser origins are accepted. We limit transport packets to eight kibibytes, decoded application events to four kibibytes, and each socket to twenty events per rolling ten seconds. Payloads and supported event names are validated; private payloads and credentials are not logged.

“Clients cannot publish payment completion, modify balances, choose another recipient, or join private rooms. Origin checks are not authentication. Financial notifications remain disabled until Member 2 supplies verified server authentication and recipient authorization. The development demo is excluded from the production UI.”

### 4:00–4:30 — team handover

“The team integration guide identifies the actual server factory and authentication callback contracts. Member 2 must verify the real JWT, derive identity from trusted server data, and authorize each recipient. Their code can call the existing publisher only after a PostgreSQL payment commit. Stable persisted notification IDs and a future outbox are needed for reliable deduplication and delivery. I have documented optional server-managed user rooms, but current private delivery uses verified socket identities. Authenticated payments are not demonstrated or claimed.”

## Results card for the slide or lecturer

Final repeat run on **2026-11-11 at 17:52:23 Asia/Colombo** (12:22:23 UTC): Windows x64, Node v24.14.0, 12 logical CPUs. Server and all clients share the local process/loopback environment.

| Check | Actual outcome |
| --- | --- |
| Backend / frontend unit / browser tests | 44 / 15 / 15 passed |
| Backend + frontend lint / production build | Passed |
| Integration populations | 2, 5, 10 and 25 clients |
| Performance connection attempts | 25 attempted, 25 successful, 0 failed, 0 timed out |
| Performance ping attempts | 250 attempted, 250 successful, 0 failed, 0 timed out |
| Independent IDs / peak clients | 25 / 25 |
| Final transports | 25 WebSocket connections |
| Cleanup | 0 remaining server clients |
| Duration including cleanup | 6.194 seconds |

| Application RTT statistic | ms |
| --- | ---: |
| Minimum | 2.419 |
| Maximum | 26.830 |
| Average | 10.025 |
| Median | 7.913 |
| Nearest-rank p95 | 25.545 |

This run used ten samples per client, separated by at least 650 ms between rounds, with no financial events or notifications. No warmup/outlier sample was silently removed. With ten samples in the browser, nearest-rank p95 equals the maximum; the performance report pools 250 samples. Other local runs can differ.

## Live demonstration checklist and fallback

1. Point out the development-only/no-payment label and the Start here guide.
2. Compare two socket IDs and count two; if other tabs exist, explain the higher count.
3. Ping once, send `Hello PayNet`, and identify the acknowledgment and measured RTT.
4. Run the ten-sample latency action once; do not keep clicking Ping during it. Explain the ten-second cooldown.
5. Send one test notification, show the originator-only toast, and follow View notifications to its separate test feed.
6. Return to the demo. Stop/restart the backend briefly to show automatic retry, then show transport and refreshed uptime. If retries exhaust, restore the backend and select Connect.
7. Use Disconnect/Connect to distinguish a deliberate manual pause from network recovery.
8. Show the saved test/performance evidence. If live network/bind/browser availability fails, describe the failure honestly and use the recorded results; never claim the failed live action succeeded.

To repeat the safe 25-client run outside the browser:

```powershell
cd E:\PayNet\backend
npm.cmd run test:performance -- --write-report
```

It starts its own loopback server, refuses external targets/production environments, has a 15-second workload limit plus bounded cleanup, and replaces the report file. Presentation numbers above describe the recorded final run; update them if intentionally presenting a later report.

## Likely lecturer questions and concise answers

**Why Socket.IO instead of only REST?** REST suits individual request/response operations. Socket.IO provides the persistent bidirectional event channel, acknowledgments, and lifecycle handling used by this demo. Neither replaces server-side payment validation.

**Is Socket.IO the same as a raw WebSocket?** No. Socket.IO uses its own event protocol and can use polling before upgrading to WebSocket. We use matching Socket.IO server/client libraries; a bare WebSocket client is not the same protocol client.

**What exactly does RTT measure?** Client emission to valid pong acknowledgment, measured with `performance.now()`. It includes serialization, local transport, server handling, and scheduling. It is not one-way delay and does not subtract a server wall-clock timestamp.

**Can you claim PayNet supports only or at least 25 production users?** No. Twenty-five is the deliberate safety cap of the local test, not a production capacity limit or guarantee. The test checks independent connections and correctness within that scope.

**What are the current real financial features?** None through Socket.IO. Contracts and a fail-closed publisher interface are ready, but authentication, committed payment hooks, persistence, and production deployment are not integrated.

**How are notifications private?** Test notices go directly to the originating socket. The future publisher requires both trusted callbacks, matches a privately stored verified identity, and authorizes each session before emission. It never globally broadcasts financial notices.

**Are user rooms already implemented?** No. Current verified-user publication targets sockets directly. The handover shows an optional future server-only room association after real JWT verification, without client room subscriptions.

**Do acknowledgments prove that a payment happened?** No. They prove only this tested request/response completed. A payment outcome must come from Member 2's committed backend transaction, not from client emission or a networking acknowledgment.

**Does Socket.IO guarantee exactly-once delivery?** Not this implementation. We do not automatically retry application requests or replay missed server messages. The listener has bounded ID deduplication; durable delivery needs persisted IDs, idempotency, and an outbox/catch-up design. See [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).

**What prevents an authentication retry loop?** Structured permanent errors stop reconnection; the UI requires a deliberate action after credentials are checked. Temporary errors use exponential backoff with jitter and at most eight attempts. Refreshing credentials itself belongs to Member 2.

**Is CORS sufficient authentication?** No. Browser origin restrictions reduce cross-origin exposure, but native clients can omit or forge Origin. Financial delivery still requires real identity verification and authorization.

**What happens when the user goes offline?** Requests are rejected or time out and connection state is cleared. Transport recovery reconnects within its retry budget, with a new socket identity. Missed notifications are not replayed by the current module.

**How do you prevent duplicate listeners or notices?** One socket/manager per tab, shared notification subscriptions, exact cleanup callbacks, stable server IDs, and bounded per-event ID deduplication. Reconnect/unmount/parallel-cancellation behavior is covered by tests. This is not durable cross-reload deduplication.

**What remains before production?** Member 2's real JWT/session verification, recipient authorization, payment commit hooks and persistence; plus a reviewed production transport/frontend path, TLS/WSS, revocation, deployment origins, global abuse protection, and distributed routing if needed.

**Did you build the entire UI or database?** No. The original UI and health API were recovered from the team's existing branch snapshots and preserved. My contribution is the networking modules, demo additions, notification infrastructure, tests, resilience/security, and integration/presentation material.
