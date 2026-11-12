# PayNet desktop redesign

Implemented directly in the standard Java/Eclipse project, with no external dependencies.

## Design and behavior

Teal and navy identity, Segoe UI typography, rounded cards, Java2D stroke icons,
visible keyboard focus, high-contrast buttons, dashboard activity, dedicated transfer
and history screens, registration/login switch, configurable host/port, password
visibility toggle, positive-amount validation, and simulation-only deposit dialog.
The transaction table uses actual server statuses, signed amounts, fixed minimum
column widths, horizontal/vertical scrolling, full-value tooltips, and empty states.
The dashboard and history page share one transaction model.

Button hover interpolation, press feedback, notification fade-in/fade-out, and an
indeterminate network progress indicator provide lightweight feedback. For reduced
motion, launch with VM argument `-Dpaynet.reducedMotion=true`. Animation timers stop
when their components are removed; network workers and sockets close on disposal.

All TCP calls use the existing NetClient API on a single background executor.
Swing updates run on the EDT. Pending operations disable submission controls;
server replies determine displayed balances and success messages. Session tokens
reject stale account updates. Logout, reconnection, real-time push notifications,
registration, deposits, transfers, and history remain supported. No currency was
specified by Money or the protocol, so amounts remain currency-neutral.

## Exact source inventory

Modified:
- src/com/paynet/client/PayNetGui.java

Created:
- src/com/paynet/client/ui/Theme.java — palette, typography, inputs, layouts, rounded panels
- src/com/paynet/client/ui/ModernButton.java — painted controls, focus, hover and press feedback
- src/com/paynet/client/ui/VectorIcon.java — scalable Java2D icons
- src/com/paynet/client/ui/BalanceCard.java — decorative card artwork
- src/com/paynet/client/ui/TransactionHistory.java — shared table model, rendering, empty state
- src/com/paynet/client/ui/ToastLabel.java — non-modal animated feedback
- src/com/paynet/test/DesktopIntegrationTest.java — real Swing + TCP integration harness

Created documentation/artifacts:
- docs/DESKTOP_REDESIGN.md (this file)
- docs/ui-preview/dashboard.png
- docs/ui-preview/dashboard-minimum.png
- docs/ui-preview/authentication.png
- docs/ui-preview/transfer.png
- docs/ui-preview/test-results.txt

Compilation refreshes generated .class files under bin/. Server, common, web,
NetClient, .project, and .classpath source/configuration contents are unchanged.

## Verification

All Java sources compiled with `javac --release 17 -encoding UTF-8 -d bin` using
Eclipse's bundled JDK 25 compiler. No Java 25 APIs are required.

`com.paynet.test.DesktopIntegrationTest` starts an isolated TCP server on an available
local port and stores test accounts in a new OS temporary directory. It runs the
existing protocol test as a subprocess, then exercises two real Swing windows.
Run this integration test on a graphical desktop, not in headless mode.

- ProtocolSmokeTest: 40 passed, 0 failed.
- DesktopIntegrationTest: 16 passed; registration in two windows, login, starting
  balance, deposit dialog, transfer, recipient live balance, live history, zero
  amount, fractional cents, insufficient funds, missing recipient, unchanged
  balance after failures, logout, login again, and server disconnect.
- Captured and inspected actual Swing rendering at the default 1240x740 and minimum
  1020x700 window sizes. The compact dashboard table scrolls at the minimum size.
- Detailed output is in ui-preview/test-results.txt.

Remaining verification: a second physical laptop/LAN connection, different OS/font
and high-DPI configurations, and manual keyboard/accessibility review. The automated
server used an ephemeral port rather than requiring localhost:5000 to be free;
the application defaults remain localhost:5000. Existing LoadTest was not run.
The history refresh retains the newest 100 records, and live events append to it.
No backend changes, commits, pushes, archives, or duplicate projects were made.

## Eclipse run instructions

1. Use a Java 17+ JDK; refresh the project and let Eclipse build it.
2. Right-click src/com/paynet/server/ServerMain.java → Run As → Java Application.
3. Right-click src/com/paynet/client/PayNetGui.java → Run As → Java Application.
4. Keep localhost and 5000 for a local server. For another laptop, enter that
   server's network hostname/IP and TCP port. Register or sign in.
5. Launch PayNetGui again to demonstrate a second client and live incoming payments.
6. Optionally run DesktopIntegrationTest as a Java Application for isolated checks.
