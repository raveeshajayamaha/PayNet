package com.paynet.test;

import com.paynet.common.Money;
import com.paynet.common.Protocol;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.io.OutputStreamWriter;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Load / concurrency test. Usage: LoadTest [clients=20] [transfersPerClient=50] [host=localhost] [port=5000]
 * Talks only the raw text protocol (docs/PROTOCOL.md). Proves thread-safety: total money must be conserved.
 */
public class LoadTest {
    static final long START_BALANCE = 100000; // cents, demo balance given on registration

    static final AtomicInteger okTransfers = new AtomicInteger();
    static final AtomicInteger fundsRejected = new AtomicInteger();
    static final AtomicInteger otherErrors = new AtomicInteger();
    static final AtomicLong totalLatencyNanos = new AtomicLong();
    static final AtomicInteger eventsReceived = new AtomicInteger();
    static final AtomicInteger clientFailures = new AtomicInteger();

    /** Minimal protocol client: a reader thread separates EVENT lines from replies. */
    static class Conn implements AutoCloseable {
        final Socket socket;
        final PrintWriter out;
        final BlockingQueue<String> replies = new LinkedBlockingQueue<>();
        final Thread reader;

        Conn(String host, int port) throws IOException {
            socket = new Socket(host, port);
            socket.setTcpNoDelay(true);
            out = new PrintWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8), true);
            BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            reader = new Thread(() -> {
                try {
                    String line;
                    while ((line = in.readLine()) != null) {
                        if (line.startsWith(Protocol.EVENT + Protocol.SEP)) eventsReceived.incrementAndGet();
                        else replies.add(line);
                    }
                } catch (IOException ignored) { }
            }, "reader");
            reader.setDaemon(true);
            reader.start();
        }

        String call(String cmd) throws Exception {
            out.println(cmd);
            String r = replies.poll(10, TimeUnit.SECONDS);
            if (r == null) throw new IOException("timeout waiting for reply to: " + cmd);
            return r;
        }

        @Override public void close() {
            try { socket.close(); } catch (IOException ignored) { }
        }
    }

    public static void main(String[] args) throws Exception {
        int n = args.length > 0 ? Integer.parseInt(args[0]) : 20;
        int m = args.length > 1 ? Integer.parseInt(args[1]) : 50;
        String host = args.length > 2 ? args[2] : "localhost";
        int port = args.length > 3 ? Integer.parseInt(args[3]) : Protocol.TCP_PORT;
        if (n < 2) { System.out.println("Need at least 2 clients."); return; }

        String suffix = Long.toString(System.nanoTime() % 100000000L, 36);
        String[] names = new String[n];
        for (int i = 0; i < n; i++) names[i] = "lt" + suffix + "_" + i;
        long[] balances = new long[n];
        boolean[] gotBalance = new boolean[n];

        System.out.println("=== PayNet LoadTest: " + n + " clients x " + m + " transfers against " + host + ":" + port + " ===");

        CountDownLatch registered = new CountDownLatch(n);
        CountDownLatch go = new CountDownLatch(1);
        CountDownLatch transfersDone = new CountDownLatch(n);
        CountDownLatch finish = new CountDownLatch(1);
        CountDownLatch finished = new CountDownLatch(n);
        List<Thread> threads = new ArrayList<>();

        for (int i = 0; i < n; i++) {
            final int id = i;
            Thread t = new Thread(() -> {
                Random rnd = new Random(id * 7919L + System.nanoTime());
                boolean regCounted = false, doneCounted = false;
                try (Conn c = new Conn(host, port)) {
                    expectOk(c.call("REGISTER|" + names[id] + "|pass1234|Load Tester " + id), "OK|REGISTER");
                    expectOk(c.call("LOGIN|" + names[id] + "|pass1234"), "OK|LOGIN");
                    registered.countDown(); regCounted = true;
                    go.await();
                    for (int k = 0; k < m; k++) {
                        int other;
                        do { other = rnd.nextInt(n); } while (other == id);
                        long cents = 1 + rnd.nextInt(5000); // 0.01 .. 50.00
                        long t0 = System.nanoTime();
                        String r = c.call("TRANSFER|" + names[other] + "|" + cents + "|load " + id + "-" + k);
                        totalLatencyNanos.addAndGet(System.nanoTime() - t0);
                        if (r.startsWith("OK|TRANSFER")) okTransfers.incrementAndGet();
                        else if (r.startsWith("ERR|" + Protocol.E_FUNDS)) fundsRejected.incrementAndGet();
                        else { otherErrors.incrementAndGet(); System.out.println("  unexpected reply: " + r); }
                    }
                    transfersDone.countDown(); doneCounted = true;
                    finish.await(); // wait until every client is done, then read the final balance
                    String b = c.call("BALANCE");
                    String[] p = b.split("\\|");
                    if (p.length >= 3 && p[0].equals("OK")) { balances[id] = Long.parseLong(p[2]); gotBalance[id] = true; }
                    Thread.sleep(500); // let trailing EVENT lines arrive
                    c.call("LOGOUT");
                } catch (Exception e) {
                    clientFailures.incrementAndGet();
                    System.out.println("  client " + id + " failed: " + e);
                } finally {
                    if (!regCounted) registered.countDown();
                    if (!doneCounted) transfersDone.countDown();
                    finished.countDown();
                }
            }, "client-" + i);
            threads.add(t);
            t.start();
        }

        registered.await();
        System.out.println("All clients registered and logged in. Starting transfers...");
        long start = System.nanoTime();
        go.countDown();
        transfersDone.await();
        long elapsed = System.nanoTime() - start;
        finish.countDown();
        finished.await();

        long sum = 0; int have = 0;
        for (int i = 0; i < n; i++) if (gotBalance[i]) { sum += balances[i]; have++; }
        long expected = (long) n * START_BALANCE;
        int attempted = n * m;
        int completed = okTransfers.get() + fundsRejected.get() + otherErrors.get();
        double secs = elapsed / 1e9;
        double throughput = okTransfers.get() / Math.max(secs, 1e-9);
        double avgMs = completed == 0 ? 0 : (totalLatencyNanos.get() / 1e6) / completed;

        boolean conserved = have == n && sum == expected;
        boolean events = eventsReceived.get() > 0 && okTransfers.get() > 0;
        boolean noErrors = clientFailures.get() == 0 && otherErrors.get() == 0;
        boolean all = conserved && events && noErrors;

        System.out.println();
        System.out.println("---------------- REPORT ----------------");
        System.out.printf("Transfers attempted     : %d%n", attempted);
        System.out.printf("  successful            : %d%n", okTransfers.get());
        System.out.printf("  rejected (funds)      : %d%n", fundsRejected.get());
        System.out.printf("  unexpected errors     : %d%n", otherErrors.get());
        System.out.printf("Client failures         : %d%n", clientFailures.get());
        System.out.printf("Elapsed                 : %.2f s%n", secs);
        System.out.printf("Throughput              : %.1f successful transactions/sec%n", throughput);
        System.out.printf("Average latency         : %.2f ms per transfer round-trip%n", avgMs);
        System.out.printf("EVENT lines received    : %d (about %d expected: 2 per successful transfer)%n",
                eventsReceived.get(), 2 * okTransfers.get());
        System.out.printf("Sum of balances         : %s (expected %s, %d/%d balances read)%n",
                Money.format(sum), Money.format(expected), have, n);
        System.out.println("----------------------------------------");
        System.out.println((conserved ? "PASS" : "FAIL") + "  money conserved (thread-safety)");
        System.out.println((events ? "PASS" : "FAIL") + "  real-time EVENT push received");
        System.out.println((noErrors ? "PASS" : "FAIL") + "  no client failures / unexpected errors");
        System.out.println(all ? "OVERALL: PASS" : "OVERALL: FAIL");
        System.exit(all ? 0 : 1);
    }

    static void expectOk(String reply, String prefix) throws IOException {
        if (!reply.startsWith(prefix)) throw new IOException("expected " + prefix + " but got: " + reply);
    }
}
