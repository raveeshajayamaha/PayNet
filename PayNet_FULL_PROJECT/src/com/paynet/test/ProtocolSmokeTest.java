package com.paynet.test;

import com.paynet.common.Protocol;
import com.paynet.common.Transaction;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/** Scripted test of every protocol command and error code. Usage: ProtocolSmokeTest [host] [port] */
public class ProtocolSmokeTest {
    static int passed = 0, failed = 0;

    static class Conn implements AutoCloseable {
        final Socket s;
        final PrintWriter out;
        final BlockingQueue<String> replies = new LinkedBlockingQueue<>();
        final BlockingQueue<String> events = new LinkedBlockingQueue<>();

        Conn(String host, int port) throws IOException {
            s = new Socket(host, port);
            out = new PrintWriter(new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8), true);
            BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
            Thread t = new Thread(() -> {
                try {
                    String l;
                    while ((l = in.readLine()) != null) {
                        if (l.startsWith("EVENT|")) events.add(l); else replies.add(l);
                    }
                } catch (IOException ignored) { }
            });
            t.setDaemon(true);
            t.start();
        }

        String call(String cmd) throws Exception {
            out.println(cmd);
            return next();
        }

        String next() throws Exception {
            String r = replies.poll(5, TimeUnit.SECONDS);
            return r == null ? "<timeout>" : r;
        }

        public void close() { try { s.close(); } catch (IOException ignored) { } }
    }

    static void check(String name, boolean ok, String detail) {
        if (ok) passed++; else failed++;
        System.out.println((ok ? "PASS  " : "FAIL  ") + name + (ok ? "" : "   -> " + detail));
    }

    static void expect(String name, String actual, String prefix) {
        check(name, actual.startsWith(prefix), "expected '" + prefix + "...' got '" + actual + "'");
    }

    public static void main(String[] args) throws Exception {
        String host = args.length > 0 ? args[0] : "localhost";
        int port = args.length > 1 ? Integer.parseInt(args[1]) : Protocol.TCP_PORT;
        String sfx = Long.toString(System.nanoTime() % 100000000L, 36);
        String alice = "sa" + sfx, bob = "sb" + sfx;
        System.out.println("=== PayNet protocol smoke test against " + host + ":" + port + " ===");

        try (Conn a = new Conn(host, port); Conn b = new Conn(host, port); Conn anon = new Conn(host, port)) {
            // not logged in
            expect("BALANCE before login -> NOT_LOGGED_IN", anon.call("BALANCE"), "ERR|" + Protocol.E_NOT_LOGGED_IN);
            expect("DEPOSIT before login -> NOT_LOGGED_IN", anon.call("DEPOSIT|100"), "ERR|" + Protocol.E_NOT_LOGGED_IN);
            expect("TRANSFER before login -> NOT_LOGGED_IN", anon.call("TRANSFER|x|100|n"), "ERR|" + Protocol.E_NOT_LOGGED_IN);
            expect("HISTORY before login -> NOT_LOGGED_IN", anon.call("HISTORY|5"), "ERR|" + Protocol.E_NOT_LOGGED_IN);
            expect("PING works without login", anon.call("PING"), "OK|PONG");
            expect("unknown command -> BAD_REQUEST", anon.call("FLY|me|to|moon"), "ERR|" + Protocol.E_BAD_REQUEST);

            // register
            expect("REGISTER alice", a.call("REGISTER|" + alice + "|secret1|Alice Test"), "OK|REGISTER|" + alice);
            expect("REGISTER bob", b.call("REGISTER|" + bob + "|secret2|Bob Test"), "OK|REGISTER|" + bob);
            expect("REGISTER duplicate -> USER_EXISTS", anon.call("REGISTER|" + alice + "|secret1|Again"), "ERR|" + Protocol.E_EXISTS);
            expect("REGISTER bad username -> BAD_REQUEST", anon.call("REGISTER|a!|secret1|X"), "ERR|" + Protocol.E_BAD_REQUEST);

            // login
            expect("LOGIN wrong password -> AUTH_FAILED", anon.call("LOGIN|" + alice + "|wrong"), "ERR|" + Protocol.E_AUTH);
            expect("LOGIN unknown user -> AUTH_FAILED", anon.call("LOGIN|nobody" + sfx + "|x1234"), "ERR|" + Protocol.E_AUTH);
            String la = a.call("LOGIN|" + alice + "|secret1");
            expect("LOGIN alice", la, "OK|LOGIN|" + alice + "|100000");
            expect("LOGIN bob", b.call("LOGIN|" + bob + "|secret2"), "OK|LOGIN|" + bob + "|100000");

            // balance / deposit
            expect("BALANCE = 100000", a.call("BALANCE"), "OK|BALANCE|100000");
            expect("DEPOSIT 5000", a.call("DEPOSIT|5000"), "OK|DEPOSIT|");
            expect("BALANCE after deposit = 105000", a.call("BALANCE"), "OK|BALANCE|105000");
            expect("DEPOSIT 0 -> INVALID_AMOUNT", a.call("DEPOSIT|0"), "ERR|" + Protocol.E_AMOUNT);
            expect("DEPOSIT negative -> INVALID_AMOUNT", a.call("DEPOSIT|-5"), "ERR|" + Protocol.E_AMOUNT);

            // transfer
            String tr = a.call("TRANSFER|" + bob + "|2500|lunch money");
            expect("TRANSFER alice -> bob", tr, "OK|TRANSFER|");
            check("TRANSFER new balance = 102500", tr.endsWith("|102500"), tr);
            expect("bob balance = 102500", b.call("BALANCE"), "OK|BALANCE|102500");
            expect("TRANSFER zero -> INVALID_AMOUNT", a.call("TRANSFER|" + bob + "|0|x"), "ERR|" + Protocol.E_AMOUNT);
            expect("TRANSFER negative -> INVALID_AMOUNT", a.call("TRANSFER|" + bob + "|-100|x"), "ERR|" + Protocol.E_AMOUNT);
            expect("TRANSFER non-numeric -> INVALID_AMOUNT or BAD_REQUEST",
                    mapBad(a.call("TRANSFER|" + bob + "|abc|x")), "ERR|OK_BAD");
            expect("TRANSFER to self -> SELF_TRANSFER", a.call("TRANSFER|" + alice + "|100|x"), "ERR|" + Protocol.E_SELF);
            expect("TRANSFER unknown user -> NO_SUCH_USER", a.call("TRANSFER|ghost" + sfx + "|100|x"), "ERR|" + Protocol.E_NO_USER);
            expect("TRANSFER too much -> INSUFFICIENT_FUNDS", a.call("TRANSFER|" + bob + "|50000000|x"), "ERR|" + Protocol.E_FUNDS);
            expect("balance unchanged after failures", a.call("BALANCE"), "OK|BALANCE|102500");

            // real-time events
            String ev = b.events.poll(3, TimeUnit.SECONDS);
            check("receiver bob got EVENT|TX push", ev != null && ev.startsWith("EVENT|TX|"), String.valueOf(ev));
            if (ev != null && ev.startsWith("EVENT|TX|")) {
                try {
                    Transaction t = Transaction.fromWire(ev.substring("EVENT|TX|".length()));
                    check("EVENT carries correct transaction", t.getFrom().equals(alice) && t.getTo().equals(bob) && t.getCents() == 2500, ev);
                } catch (Exception e) { check("EVENT parses as Transaction", false, ev); }
            }
            check("sender alice also got EVENT|TX", a.events.poll(3, TimeUnit.SECONDS) != null, "none");

            // history
            String h = a.call("HISTORY|10");
            expect("HISTORY header", h, "OK|HISTORY|");
            int cnt = 0;
            try { cnt = Integer.parseInt(h.split("\\|")[2]); } catch (Exception ignored) { }
            check("HISTORY has at least 2 entries (welcome deposit + deposit + transfer)", cnt >= 2, h);
            boolean linesOk = true; String first = null;
            for (int i = 0; i < cnt; i++) {
                String l = a.next();
                if (i == 0) first = l;
                if (!l.startsWith("TX|")) linesOk = false;
            }
            check("HISTORY lines start with TX|", linesOk, "bad line");
            check("HISTORY newest first (transfer)", first != null && first.contains("|" + alice + "|" + bob + "|2500|"), String.valueOf(first));
            expect("connection still usable after HISTORY", a.call("PING"), "OK|PONG");

            // logout
            expect("LOGOUT", b.call("LOGOUT"), "OK|LOGOUT");
            String after = b.replies.poll(2, TimeUnit.SECONDS);
            check("server closed connection after LOGOUT", after == null, String.valueOf(after));
            expect("LOGOUT alice", a.call("LOGOUT"), "OK|LOGOUT");
        } catch (IOException e) {
            check("connect to server", false, e.toString());
        }

        System.out.println();
        System.out.println("Passed: " + passed + "  Failed: " + failed);
        System.out.println(failed == 0 ? "OVERALL: PASS" : "OVERALL: FAIL");
        System.exit(failed == 0 ? 0 : 1);
    }

    /** Non-numeric amount may legitimately be INVALID_AMOUNT or BAD_REQUEST. */
    static String mapBad(String r) {
        return (r.startsWith("ERR|" + Protocol.E_AMOUNT) || r.startsWith("ERR|" + Protocol.E_BAD_REQUEST)) ? "ERR|OK_BAD" : r;
    }
}
