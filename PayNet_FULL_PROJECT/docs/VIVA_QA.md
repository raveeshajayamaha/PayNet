# Viva Questions and Short Answers

1. **What is a socket?** An endpoint of a two-way network connection identified by IP address and port. `Socket` is the client end, `ServerSocket` listens.
2. **Why TCP and not UDP?** TCP is connection-oriented, reliable, ordered and error-checked; a payment message must not be lost or duplicated. UDP is faster but unreliable.
3. **When would UDP be better?** Live video/voice, games, DNS: low latency matters more than every packet.
4. **How does the server handle many clients?** An accept loop creates a thread per connection; each thread blocks reading its own socket.
5. **Disadvantage of thread-per-client?** Memory and context-switch cost for thousands of clients; solution: thread pool or NIO selectors.
6. **What is a race condition? Example here?** Two threads read the same balance, both subtract, one update is lost. Concurrent transfers from one account without locking.
7. **How did you make transfers atomic?** Debit and credit happen inside one critical section (synchronized/locks), so no other thread sees a half-done transfer.
8. **What is a deadlock and how avoided?** Two threads each hold one lock and wait for the other's. Avoided by always locking accounts in a fixed order (e.g. alphabetical username) or a single lock.
9. **What does `synchronized` do?** Gives mutual exclusion via an object's monitor and guarantees visibility of changes (happens-before).
10. **How do you prove thread safety?** LoadTest runs many clients in parallel; the sum of all balances must still equal N x 1000.00.
11. **Why can money not be created even on errors?** Validation (amount, funds, user) is done before changing anything, inside the lock; failures change nothing.
12. **Why store money in cents as `long`?** `double` has rounding errors (0.1 + 0.2); integers are exact.
13. **Describe your protocol.** Line-based UTF-8 text, fields separated by `|`, `OK|CMD|...` or `ERR|CODE|msg`, plus server-pushed `EVENT|TX|...`.
14. **Why a text protocol?** Human-readable, easy to debug and test; binary would be smaller and faster.
15. **How do you delimit messages over a TCP stream?** TCP is a byte stream with no message boundaries, so we use newline framing and `readLine()`.
16. **What if a note contains `|` or newline?** `Transaction.clean` replaces them with spaces so framing cannot break.
17. **How does the client receive real-time events?** A dedicated reader thread reads all lines; EVENT lines go to the UI, others to the waiting request.
18. **Why must Swing updates use `invokeLater`?** Swing is single-threaded; components must be changed only on the Event Dispatch Thread.
19. **What is SSE?** Server-Sent Events: a long-lived HTTP response with `Content-Type: text/event-stream` where the server pushes `event:`/`data:` messages; browser `EventSource` reconnects automatically.
20. **SSE vs WebSocket vs polling?** SSE is one-way push over plain HTTP; WebSocket is full duplex but more complex; polling wastes requests and has delay.
21. **How do TCP and web front ends stay consistent?** Both call the same `PaymentService`, which notifies listeners; each front end forwards the event to its clients.
22. **How are passwords handled?** Stored as salted hashes, not plain text (state honestly what your implementation does). No TLS here, so traffic is readable on the LAN; production needs TLS.
23. **How do sessions work?** Login returns a random token (web) or marks the TCP connection authenticated; the server maps token to user.
24. **What happens when a client disconnects abruptly?** `readLine` returns null or throws IOException; the handler removes the connection and closes the socket; the server continues.
25. **How would you scale this?** Database with transactions, thread pool/NIO, load balancer, message queue for events, TLS, idempotency keys for retries.
26. **What is the client-server model?** Clients request services from a central server that owns the data and rules.
27. **What is a port and what does "Address already in use" mean?** A 16-bit number identifying a service on a host; the port is already bound by another process.
