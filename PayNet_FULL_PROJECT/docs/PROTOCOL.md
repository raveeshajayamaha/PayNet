# PayNet Protocol (TCP, port 5000)

Text protocol, UTF-8, one message per line (`\n`), fields separated by `|`. Amounts are cents (long).
Constants live in `com.paynet.common.Protocol`. Transaction wire = `id|from|to|cents|timestampMillis|status|note`.

| Client sends | Server replies (success) |
|---|---|
| `REGISTER|user|pass|fullName` | `OK|REGISTER|user` |
| `LOGIN|user|pass` | `OK|LOGIN|user|balanceCents` (connection is now authenticated and receives EVENTs) |
| `BALANCE` | `OK|BALANCE|cents` |
| `DEPOSIT|cents` | `OK|DEPOSIT|txId|newBalanceCents` |
| `TRANSFER|toUser|cents|note` | `OK|TRANSFER|txId|newBalanceCents` |
| `HISTORY|limit` | `OK|HISTORY|n` then n lines `TX|<transaction wire>` (newest first) |
| `PING` | `OK|PONG` |
| `LOGOUT` | `OK|LOGOUT` then server closes the connection |

Any failure: `ERR|CODE|message` (codes in Protocol.java). Commands other than REGISTER/LOGIN/PING before login -> `ERR|NOT_LOGGED_IN|...`.
Unknown/malformed -> `ERR|BAD_REQUEST|...`.

**Real-time push:** after every completed transaction the server sends, at any time, to every logged-in connection of the
sender and of the receiver: `EVENT|TX|<transaction wire>`. Clients therefore need a reader thread that separates
EVENT lines from replies.

# Web API (HTTP, port 8080) - same PaymentService, JSON
Static website served from `web/`. Auth: header `Authorization: Bearer <token>` (token from login).
- POST /api/register {username,password,fullName}  -> {ok:true}
- POST /api/login {username,password} -> {token,username,balance}
- POST /api/logout
- GET  /api/balance -> {balance}
- POST /api/deposit {amount}  (amount in cents) -> {transaction,balance}
- POST /api/transfer {to,amount,note} -> {transaction,balance}
- GET  /api/history?limit=20 -> {transactions:[...]}
- GET  /api/stream?token=<token>  Server-Sent Events (text/event-stream): event `tx` with the transaction JSON, in real time; `ping` every 15s.
- GET  /api/stats -> {users, transactions, volume}  (public, for the landing page)
Errors: HTTP 400/401 with {error:CODE,message}. Transaction JSON: {id,from,to,amount,timestamp,status,note}.
