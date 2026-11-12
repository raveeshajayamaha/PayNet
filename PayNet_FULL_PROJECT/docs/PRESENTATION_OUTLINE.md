# Presentation Outline (10-12 slides, about 12 minutes)

1. **Title**: PayNet, team, course. Say: "A real-time payment system built only with Java sockets."
2. **Problem and goals**: many users, shared balances, instant feedback; must never lose or create money.
3. **Features**: register/login, deposit, transfer, history, live notifications, desktop and web clients.
4. **Architecture**: show the diagram; one server JVM, TCP :5000, HTTP :8080, one shared PaymentService.
5. **Why TCP**: reliable, ordered; UDP could drop a payment. Text protocol so it is easy to debug.
6. **Protocol**: show 4-5 commands and replies, the ERR codes, and the EVENT push line.
7. **Threads**: accept thread plus one thread per client; client reader thread separates replies from EVENT lines; Swing EDT.
8. **Atomic transfers**: race-condition example (two threads, same balance); locks acquired in fixed order to avoid deadlock.
9. **Real-time web**: SSE explained (one-way, plain HTTP, auto reconnect) versus polling and WebSockets.
10. **Live demo**: two GUIs and the website; transfer; show instant update; show an error (insufficient funds).
11. **Testing and results**: smoke test PASS list; LoadTest report: sum of balances conserved, tx/s, average latency.
12. **Conclusion and future work**: database, TLS, NIO, WebSockets; Q&A.

Tips: start server and clients before the talk; keep LoadTest output ready in a terminal; rehearse the demo twice.
