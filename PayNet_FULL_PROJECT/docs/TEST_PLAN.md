# Test Plan

Run the server, then `ProtocolSmokeTest` (automated, one PASS/FAIL per row marked A) and `LoadTest`. Manual tests use the GUI and website.

| ID | Test case | Steps | Expected result | Type |
|---|---|---|---|---|
| T01 | Register new user | `REGISTER|u|pass1|Name` | `OK|REGISTER|u` | A |
| T02 | Duplicate username | Register same name twice | `ERR|USER_EXISTS` | A |
| T03 | Invalid username | `REGISTER|a!|pass1|X` | `ERR|BAD_REQUEST` | A |
| T04 | Login success | Correct credentials | `OK|LOGIN|u|100000` | A |
| T05 | Wrong password | Wrong password | `ERR|AUTH_FAILED` | A |
| T06 | Unknown user login | Login nonexistent | `ERR|AUTH_FAILED` | A |
| T07 | Command before login | `BALANCE`, `DEPOSIT`, `TRANSFER`, `HISTORY` | `ERR|NOT_LOGGED_IN` | A |
| T08 | Unknown command | `FLY|x` | `ERR|BAD_REQUEST` | A |
| T09 | PING | `PING` | `OK|PONG` | A |
| T10 | Balance | `BALANCE` after login | `OK|BALANCE|100000` | A |
| T11 | Deposit | `DEPOSIT|5000` | `OK|DEPOSIT|id|105000` | A |
| T12 | Invalid deposit | `DEPOSIT|0` and `DEPOSIT|-5` | `ERR|INVALID_AMOUNT` | A |
| T13 | Transfer success | alice sends 2500 to bob | `OK|TRANSFER|id|newBalance`; bob balance +2500 | A |
| T14 | Transfer invalid amount | amount 0, negative, non-numeric | `ERR|INVALID_AMOUNT` (or BAD_REQUEST for non-numeric) | A |
| T15 | Self transfer | send to own username | `ERR|SELF_TRANSFER` | A |
| T16 | Unknown recipient | send to missing user | `ERR|NO_SUCH_USER` | A |
| T17 | Insufficient funds | send more than balance | `ERR|INSUFFICIENT_FUNDS`, balance unchanged | A |
| T18 | Real-time event | bob logged in while alice pays | bob (and alice) receive `EVENT|TX|...` | A |
| T19 | History | `HISTORY|10` | `OK|HISTORY|n` then n `TX|` lines, newest first | A |
| T20 | Logout | `LOGOUT` | `OK|LOGOUT`, connection closed | A |
| T21 | Concurrency / money conserved | `LoadTest 20 50` | Sum of balances = 20 x 1000.00, OVERALL: PASS | A |
| T22 | Higher load | `LoadTest 100 50` | PASS, no client failures; note throughput | A |
| T23 | GUI live update | Two GUIs; pay from one | Other GUI shows notification and new balance without refresh | M |
| T24 | Website live update | Pay from GUI to a user logged in on the web | Website feed updates via SSE | M |
| T25 | Web and GUI consistency | Transfer on website | GUI balance/history reflects it | M |
| T26 | Persistence | Make payments, stop and restart server, login | Balances and history preserved | M |
| T27 | Two laptops | Client on another laptop via server IPv4 | Works as on localhost | M |
| T28 | Client disconnect | Kill a client mid-session | Server keeps running; others unaffected | M |
| T29 | Server stopped | Stop server while GUI open | GUI shows connection lost message, no crash | M |

A = automated, M = manual. Record actual results and screenshots in the report.
