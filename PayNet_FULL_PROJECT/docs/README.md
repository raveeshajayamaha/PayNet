# PayNet: Real-Time Network Payment Processing System

PayNet is a small multi-user payment system written in plain Java (JDK 17, no external libraries). A central
server keeps accounts and balances; many clients connect over the network, register, log in, deposit money and
transfer money to each other. Every completed payment is pushed in real time to the people involved.

## Features
- Multi-threaded TCP server (port 5000) with a simple text protocol (see `PROTOCOL.md`).
- Swing desktop client with login, balance, transfer form, history and live notifications.
- Built-in web server (port 8080): website with the same features, live updates via Server-Sent Events (SSE).
- One shared, thread-safe business layer (`PaymentService`) used by both TCP and web front ends.
- Atomic transfers: money is never created or lost, even with many concurrent clients.
- Persistence in `data/` (CSV files) so accounts survive a restart.
- Test tools: `ProtocolSmokeTest` (every command and error code) and `LoadTest` (concurrency and throughput).

## Quick start
1. Install JDK 17 or newer (`java -version`, `javac -version`).
2. Start the server: `scripts\run-server.bat` (Windows) or `scripts/run-server.sh` (Linux/macOS).
3. Start a desktop client: `scripts\run-gui.bat` / `scripts/run-gui.sh` (start several for a demo).
4. Open the website: http://localhost:8080
5. Run the load test (server must be running): `scripts\run-loadtest.bat 20 50`.

Always start scripts from anywhere; they change to the project root so `data/` and `web/` are found.

## Project layout
```
src/com/paynet/common   shared: Protocol, Transaction, Money, PayNetException
src/com/paynet/server   ServerMain, TcpServer, service/ (PaymentService + implementation)
src/com/paynet/client   Swing GUI
src/com/paynet/web      embedded HTTP server and REST/SSE API
src/com/paynet/test     ProtocolSmokeTest, LoadTest
web/                    static website (HTML/CSS/JS)
data/                   saved accounts and transactions
scripts/                build and run scripts
docs/                   documentation, report template, viva questions
```

## Documents
`PROTOCOL.md`, `ARCHITECTURE.md`, `SETUP_GUIDE.md`, `TEST_PLAN.md`, `REPORT_TEMPLATE.md`,
`PRESENTATION_OUTLINE.md`, `VIVA_QA.md`.
