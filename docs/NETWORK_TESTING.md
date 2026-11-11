# PayNet M3-03: network testing and performance analysis

All testing is independent of PostgreSQL, authentication, and unfinished payment APIs. No balances, payments, or financial notifications are created. Work remains on `feature/socketio-networking`, with no commit or push.

## Architecture and methodology

The existing Express app and Socket.IO server share an HTTP server. Automated tests and the performance runner call the exported `createPayNetServer` factory with `environment: 'test'`, then listen on an OS-assigned port bound explicitly to **127.0.0.1**. They do not use the application's port 5000, external hosts, existing production endpoints, or the frontend's configured API URL. Each synthetic client uses its own Socket.IO manager (`forceNew: true`), so socket IDs and Engine.IO connection IDs identify independent connections. Socket.IO starts with its default polling transport and may upgrade to WebSocket.

`backend/testing/networkHarness.js` owns the isolated server, real socket.io-client instances, bounded connection/event waits, acknowledgment requests, and idempotent cleanup. Each test registers cleanup immediately after creating the harness. The application event allowlist, payload validation, privacy rules, and 20-events-per-socket-per-10-second limit remain active. Tests of missing acknowledgments modify only a handler on the isolated test server; no public fault-injection endpoint was added.

Notifications still use the M3-02 server-defined test event, delivered only to the requesting socket. Financial publishing remains disabled without Member 2's trusted server-side authentication and authorization adapters. No authentication or payment implementation was added by M3-03.

## Automated cases

| Suite | Cases / assertions |
| --- | --- |
| Multi-client | Separate scenarios for **2, 5, 10, and 25** concurrently connecting clients; unique socket and transport IDs; every client's count reaches the exact population; ping and message acknowledgment; one private notice per originator; no unrelated or duplicate notice; observer sees count return to one, then server namespace and Engine.IO counts return to baseline zero |
| Reliability | Temporary transport loss; automatic retry and new socket ID; real server shutdown, observed failed retry, and restart on the same port; no buffered requests while disconnected; recovery without duplicate notices |
| Fault handling | Withheld acknowledgment triggers a bounded timeout; pending callbacks are released; normal requests work afterwards; five clients' malformed ping/notification requests cannot disrupt valid requests |
| Lifecycle | Ten rapid sequential connect/disconnect cycles; one notification listener and one notice per cycle; zero server clients after every cycle; listener removal on unsubscribe |
| Frontend request helper | Real socket acknowledgments, invalid-payload rejection, timeout, cancellation, abort-listener cleanup, no disconnected buffering |
| Performance safety | Reject external-target options, more than 25 clients, invalid sample counts, production and unknown environments; small real run verifies metric totals, independent IDs, and cleanup |
| Latency unit tests | Known vectors for min/max/mean/median/nearest-rank p95; empty/invalid data; monotonic timer injection; sample limits; cancellation and deadline handling |
| Browser diagnostics | Ten RTT samples and chart on one existing socket; sample/result/statistic display; mobile width; cancellation on disconnect; unmount/remount cleanup; real transport interruption increments retry counter and recovers; one subsequent test notice |

The original health, security, notification, listener, and UI tests remain included. The isolated multi-client tests use exact counts. Browser tests allow unrelated developer tabs on the shared development server; they do not assume that the total client population is one.

Tests wait for explicit connection, retry, disconnect, and acknowledgment events or bounded state predicates. They do not assert that latency is below an arbitrary performance threshold. Cross-client notification checks use subsequent ping acknowledgments as protocol ordering barriers rather than fixed sleeps. Connection/event waits are normally 5 seconds; acknowledgment waits are 2 seconds (250 ms for deliberate missing-ack tests). Individual integration tests also have 10–15 second deadlines. Slow machines may hit these bounded failure limits, but a slow latency sample alone is not a failure.

## Commands

Node.js 24 and the existing installed dependencies are used; M3-03 adds no dependencies. From PowerShell:

```powershell
cd E:\PayNet\backend
npm.cmd test
npm.cmd run test:multi
npm.cmd run lint
npm.cmd run test:performance -- --write-report
```

`test:multi` runs the ten multi-client/reliability tests, which are also included in the full backend suite. The performance command starts and closes its own loopback server; neither development app needs to be running.

For frontend/browser validation, start the development backend and frontend in separate terminals (`npm.cmd run dev` from each directory), then:

```powershell
cd E:\PayNet\frontend
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run build
npm.cmd test
```

The repository's Playwright configuration uses installed Windows Microsoft Edge and `http://localhost:5173`. Configure a suitable Playwright browser path on another platform. The backend defaults to port 5000. Keep the browser origin consistent with `FRONTEND_URL=http://localhost:5173`.

## Local performance script safeguards and metrics

`backend/scripts/network-performance.js` accepts only `--clients=N` (1–25), `--samples=N` (1–10 per client), and `--write-report`. Defaults are 25 clients and 10 samples. There is **no URL/host/port override**. The script creates its own server, checks its numeric loopback URL, and refuses production/staging NODE_ENV values before opening connections. Empty/unset NODE_ENV means a local development invocation.

Each client sends at most ten ping requests. A round sends one ping from each connected client, waits for the results, then waits 650 ms before the next round. This is a bounded simultaneous burst of at most 25 events, roughly 1.54 pings/second per client at most, and remains below the server's existing per-socket limit. No notifications of any kind are sent by the performance runner. The script does not simulate payment traffic.

Connections have 5-second deadlines, acknowledgments have 2-second deadlines, and the workload has a 15-second abort deadline. Cleanup has a separate 5-second deadline. A `finally` block disconnects every owned socket/manager, removes owned listeners, closes the isolated Socket.IO/HTTP server, and checks that both namespace and Engine.IO counts are zero. SIGINT/SIGTERM request cancellation through the same cleanup path. As with other JavaScript timers, deadlines depend on the event loop running; an OS kill cannot execute JavaScript cleanup, though the OS closes process sockets.

Connection and acknowledgment metrics each report **attempted, successful, failed, and timedOut** operations. Those outcome categories are mutually exclusive: attempted = successful + failed + timedOut after a completed operation batch. A failed connection causes no ping attempts for that client; `unattemptedAcknowledgments` reports the difference from the configured total. Server rejections/disconnections count as failed; deadline expiry counts as timed out. The report records distinct client IDs, peak population, final transports, setup statistics, successful raw RTT samples, errors, elapsed duration, and cleanup state. Any incomplete workload, failed operation, or failed cleanup yields a nonzero exit code.

The terminal prints a summary. `--write-report` additionally writes the complete JSON and raw samples to [network-performance-results.json](./network-performance-results.json), replacing the previous local report. Keep or copy reports separately if comparing runs.

## Round-trip latency calculation

Both the UI and local script use `performance.now()`, a monotonic high-resolution clock. A sample starts immediately before sending `network:ping` and ends after receiving its valid `pong` acknowledgment. It includes client scheduling, Socket.IO serialization, local transport, server dispatch, response handling, and any upgrade/event-loop delay. It is **application round-trip latency**, not one-way network delay or wire-only latency. Clocks need not be synchronized; server wall-clock timestamps are not used for latency calculation.

`shared/latency.mjs` computes min/max, arithmetic mean, median (mean of the two central values for even counts), and nearest-rank p95: sort ascending and select index `ceil(0.95 × N) - 1`. No samples are silently discarded as warmup/outliers. With ten browser samples p95 equals the maximum; this small sample set is diagnostic, not a statistical service-level estimate. Failed/timed-out operations are reported separately and excluded from successful RTT statistics. Empty sample sets produce no statistics.

## Historical M3-03 executed results — 2026-11-11

Validation completed successfully: **28/28 backend tests**, **8/8 frontend unit tests**, and **13/13 browser tests**. The explicit `test:multi` command passed **10/10** tests (a subset of the backend total). Backend/frontend lint, frontend production build, and the local 25-client performance command passed. Production output excludes the diagnostics UI. No new dependencies were installed.

Historical M3-03 standalone run: **17:17:33 Asia/Colombo** (11:47:33 UTC), Windows x64, Node **v24.14.0**, 12 logical CPUs. Server and clients ran in the same Node process on IPv4 loopback; existing development applications were present. This run was separate from the backend test command and followed the diagnostics browser checks. Values below were recorded from that run and are rounded to three decimal places. The final handover repeats the measurement and replaces the JSON report; see the final handover section below for the current report's values.

| Operation | Attempted | Successful | Failed | Timed out |
| --- | ---: | ---: | ---: | ---: |
| Independent connections | 25 | 25 | 0 | 0 |
| Ping acknowledgments | 250 | 250 | 0 | 0 |

Peak population and unique socket IDs were both **25**. All 25 clients had upgraded to **WebSocket** by the end. There were **0 unattempted acknowledgments**, **0 errors**, and **0 remaining server clients** after cleanup. Total measured duration including cleanup: **6.155 seconds**.

| Measurement (ms) | Minimum | Maximum | Average | Median | p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Application RTT, 250 samples | 2.327 | 26.207 | 8.473 | 8.222 | 25.061 |
| Initial connection setup, 25 samples | 92.062 | 100.590 | 94.391 | 93.036 | 100.164 |

The earlier development run, performed alongside automated tests, also completed 25 connections and 250 pings with no errors. Its different RTT distribution illustrates local scheduling sensitivity. This historical table describes one standalone run, not an average across runs; the latest JSON is now from the final handover repeat.

## Manual demonstration

1. Start backend and frontend, then open `http://localhost:5173/network-demo`. Existing status, socket ID, population count, acknowledgment panel, test notifications, and timestamped event log remain available.
2. Select **Ping server** to display its round-trip latency. Select **Run Latency Test** to collect ten samples over roughly six seconds. Observe the line chart and min/max/average/median/p95 cards. The action creates no new sockets, has a 15-second deadline, and enforces a ten-second cooldown after each run.
3. Open a second tab to observe independent IDs and population updates. Send a nonfinancial test notice; only its originator should receive it.
4. Start a latency run, then Disconnect: the run stops, preserves only successful samples, and displays an error. Connect again to test normal requests. Navigating away cancels the old run and removes its listeners.
5. Stop/restart the development backend to observe disconnected/reconnecting status, retry count, timestamped attempts, recovery, and a fresh socket ID. An explicit Disconnect intentionally stops automatic retry until Connect is selected.
6. Run the standalone performance command above to demonstrate 25 clients safely. Do not use the browser to generate a load test.

## Environmental limitations and known issues

These results demonstrate correctness and bounded local diagnostics, not a throughput ceiling, payment-processing capacity, WAN latency, or production SLA. There is no TLS, remote network, distributed adapter, database/authentication workload, packet-loss simulation, or prolonged soak test in these measurements. Co-located clients share a CPU/event loop with the server; polling startup, transport upgrades, Windows scheduling, browser activity, and other applications affect results. The first ping round includes cold/upgrade effects. Separate machines and repeated controlled runs would be needed for a network benchmark.

The 20-event/10-second limit remains; M3-04 changes its implementation to a monotonic sliding window. Manual repeated pings/messages during a browser diagnostic run can still trigger the limit; the UI reports that rejection and retains successful samples. Counts represent sockets/tabs, not users. Since M3-04, retry counts are cumulative over the shared connection manager's lifetime in that browser tab, not reset by client-side route navigation. Acknowledgments are not retried automatically. There is no durable delivery/replay or exactly-once guarantee. Test notice deduplication remains bounded as documented in NETWORKING.md.

Backend test servers/performance scripts need local bind permission. Windows sandbox restrictions required elevated execution for Vite temporary build files and Edge launch during validation. The shared `shared/` directory must be included with backend/frontend source. There are no known unresolved implementation failures; real financial integration still awaits Member 2 and remains outside this task.

## M3-03 file inventory

Created:

- `backend/testing/networkHarness.js`
- `backend/scripts/network-performance.js`
- `backend/tests/multi-client.test.js`
- `backend/tests/reliability.test.js`
- `backend/tests/performance-safety.test.js`
- `shared/latency.mjs`
- `frontend/src/services/socketRequest.js`
- `frontend/src/hooks/useLatencyDiagnostics.js`
- `frontend/src/components/NetworkDiagnostics.jsx`
- `frontend/unit/latency.test.js`
- `frontend/tests/diagnostics.spec.js`
- `docs/NETWORK_TESTING.md`
- `docs/network-performance-results.json`

Modified:

- `backend/package.json` — multi-client/performance commands and lint coverage
- `frontend/src/services/socket.js` — reusable acknowledgment helper integration
- `frontend/src/hooks/useNetwork.js` — precise ping RTT and retry counter
- `frontend/src/pages/NetworkDemo.jsx` — diagnostics section
- `frontend/src/pages/NetworkDemo.css` — diagnostics cards and responsive chart
- `docs/NETWORKING.md` — diagnostics/test references

All earlier uncommitted M3-01/M3-02 work remains preserved. Because the initial branch tracked only `.gitignore`, Git still lists the backend/frontend/docs/shared directories as untracked relative to HEAD; this inventory describes changes relative to the existing M3-02 workspace.

## M3-04 security and resilience validation

See [NETWORK_SECURITY.md](./NETWORK_SECURITY.md) for the threat model and complete M3-04 file inventory. The backend security suite adds exact origin/preflight checks for both transports, malformed configuration rejection, application/transport oversize handling, sliding-rate boundaries and socket isolation, private-room/financial/count-event rejection, payload/notification shape validation, safe logs, handler/room cleanup, provider deadlines/errors, permanent authorization rejection, bounded acknowledgment settings, and cancellation isolation between simultaneous requests.

Frontend manager unit tests cover shared connection state, idempotent consumer cleanup, owned listener removal, transport changes, count validation, monotonic uptime origin, error-history bounds/redaction, retry exhaustion, and stopping permanent errors. Browser additions verify uptime/transport/retry displays, clearing state on disconnect, manual reconnect, and sanitized blocked-access presentation. Existing diagnostics, notifications, mobile, health and UI regressions remain included.

The two browser security checks use the existing local development server. One emits a structured error into that test page's local lifecycle emitter to test display/cleanup; it does not implement login or send a fake token. An independent real Socket.IO backend test supplies a rejecting server-side adapter and verifies that the actual error prevents retry. No external endpoint or uncontrolled load is used.

Commands remain backend `npm.cmd test` / `npm.cmd run lint`, frontend `npm.cmd run test:unit` / `npm.cmd run lint` / `npm.cmd run build` / `npm.cmd test` (with both development apps running for browsers). M3-03's saved performance report is historical and was not replaced by this security task.

Executed M3-04 validation on 2026-11-11: **44/44 backend tests**, **15/15 frontend unit tests**, and **15/15 browser tests passed**. Backend/frontend lint and the production build passed. The build excludes the development health/diagnostics UI. No new dependencies were required. During validation a frozen-options initialization regression was caught and fixed by copying the immutable policy before handing options to Socket.IO; the full browser suite was rerun successfully afterwards.

## Final demonstration and handover verification

Final verification on **2026-11-11** again passed **44 backend tests**, **15 frontend unit tests**, and **15 browser tests**, both linters, and the production build. The UI now gives a short demonstration guide, explains the difference between manual pause and recovery, identifies counts as sockets/tabs, and labels the acknowledgment as the retained last successful response. No networking/authentication/payment behavior changed in this handover.

The safe performance repeat at **17:52:23 Asia/Colombo** (12:22:23 UTC) produced the current [network-performance-results.json](./network-performance-results.json): **25/25 independent connections**, **250/250 successful ping acknowledgments**, **zero failed or timed-out operations**, **zero remaining sockets**, and a **6.194-second** total duration. All 25 clients ended on WebSocket. RTT minimum **2.419 ms**, maximum **26.830 ms**, mean **10.025 ms**, median **7.913 ms**, nearest-rank p95 **25.545 ms**. Same-machine Windows x64 / Node v24.14.0 / 12 logical CPUs; no remote network or payment workload.

[TEAM_INTEGRATION.md](./TEAM_INTEGRATION.md) describes actual integration seams and optional future room association. [MEMBER3_PRESENTATION.md](./MEMBER3_PRESENTATION.md) contains the timed script and lecturer answers. [FINAL_NETWORKING_VERIFICATION.md](./FINAL_NETWORKING_VERIFICATION.md) records the Git/file review and exact proposed commit/push commands. Historical milestone counts above describe their respective earlier runs.
