# PayNet: Real-Time Network Payment Processing System
**Course:** ________  **Team members:** ________  **Supervisor:** ________  **Date:** ________

## Abstract
150-250 words: the problem (online payments need consistent shared state and instant feedback), what you built
(multi-threaded TCP payment server, Swing client, web client with SSE), the key technique (synchronized atomic
transfers), and the main result (e.g. "20 concurrent clients, 1000 transfers, money conserved, X tx/s").

## 1. Introduction
1.1 Background (digital payments, client-server model). 1.2 Problem statement. 1.3 Scope and limitations (demo money, no real banking security).

## 2. Objectives
- Design a text protocol over TCP for payments.
- Implement a concurrent server handling many clients.
- Guarantee atomic, consistent transfers.
- Deliver real-time notifications (EVENT push, SSE).
- Provide desktop and web clients; test correctness and performance.

## 3. Literature Review
Sockets and TCP/IP (Stevens; Kurose and Ross); Java networking (Oracle tutorial; Harold, *Java Network Programming*);
concurrency (Goetz, *Java Concurrency in Practice*); push techniques: polling, long polling, WebSockets, SSE (WHATWG spec);
existing systems (e.g. PayPal, M-Pesa, UPI) at a high level. Compare and justify your choices.

## 4. Requirements
4.1 Functional (register, login, balance, deposit, transfer, history, live notification, web access).
4.2 Non-functional (thread safety, reliability, response time, usability, portability, JDK only).
4.3 Use cases / actors. 4.4 Hardware and software environment.

## 5. System Design
5.1 Architecture (insert diagram from ARCHITECTURE.md). 5.2 Protocol design (table of commands, replies, error codes).
5.3 Class diagram. 5.4 Sequence diagram of a transfer including EVENT push. 5.5 Data storage design.
5.6 Concurrency design (locks, lock ordering, listener notification). 5.7 Security considerations (password hashing, session tokens, what is missing).

## 6. Implementation
6.1 Tools. 6.2 Common package. 6.3 PaymentService and atomic transfer (code excerpt). 6.4 TcpServer and per-client threads.
6.5 Swing client and reader thread, EDT handling. 6.6 WebServer, REST API, SSE. 6.7 Persistence. 6.8 Challenges and solutions.

## 7. Testing
7.1 Test strategy. 7.2 Test cases (copy TEST_PLAN.md with actual results). 7.3 ProtocolSmokeTest output.
7.4 LoadTest method (N clients, M transfers, conservation check). 7.5 Bugs found and fixed.

## 8. Results and Discussion
Tables/graphs: throughput and latency versus number of clients (10, 20, 50, 100); screenshots of GUI and website;
analysis of bottlenecks (global lock, disk writes, thread per client); comparison to goals.

## 9. Conclusion and Future Work
Summary of achievements; limitations; future work (database, TLS, NIO/thread pool, WebSockets, two-phase commit, mobile client).

## References
1. Kurose, J., Ross, K. *Computer Networking: A Top-Down Approach*.
2. Goetz, B. et al. *Java Concurrency in Practice*. Addison-Wesley, 2006.
3. Harold, E. R. *Java Network Programming*. O'Reilly.
4. Oracle. *The Java Tutorials: Custom Networking*, https://docs.oracle.com/javase/tutorial/networking/
5. WHATWG. *HTML Living Standard: Server-sent events*.
6. Postel, J. RFC 793: Transmission Control Protocol, 1981.
7. Oracle. *Java SE 17 API: java.net, java.util.concurrent, com.sun.net.httpserver*.

## Appendices
A. Protocol specification. B. Source code listing. C. User manual (SETUP_GUIDE.md). D. Raw test logs.
