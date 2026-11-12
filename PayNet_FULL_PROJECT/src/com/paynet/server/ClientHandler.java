package com.paynet.server;

import com.paynet.common.Money;
import com.paynet.common.PayNetException;
import com.paynet.common.Protocol;
import com.paynet.common.Transaction;
import com.paynet.server.service.PaymentService;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Serves ONE client connection. It runs in its own thread (from the server's thread pool):
 * read a line, run the command, write the reply, repeat until the client leaves.
 *
 * Two kinds of threads write to the same socket: this thread (replies) and payment threads
 * (EVENT pushes). Therefore send() is synchronized, so two lines never get mixed up.
 */
public class ClientHandler implements Runnable {
    private static final int IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes without a message -> disconnect
    private static final int MAX_LINE = 4096;                  // protection against huge lines

    private final Socket socket;
    private final PaymentService service;
    private final TcpServer server;
    private final String remote;
    private BufferedReader in;
    private BufferedWriter out;
    private final Object writeLock = new Object(); // guards 'out'

    private String username; // null until LOGIN succeeds
    private String token;
    private volatile boolean closed;

    ClientHandler(Socket socket, PaymentService service, TcpServer server) {
        this.socket = socket;
        this.service = service;
        this.server = server;
        this.remote = String.valueOf(socket.getRemoteSocketAddress());
    }

    @Override
    public void run() {
        ServerLog.log("Client connected: " + remote);
        try {
            socket.setSoTimeout(IDLE_TIMEOUT_MS); // read() throws SocketTimeoutException when idle too long
            in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            out = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8));
            String line;
            while (!closed && (line = readLine()) != null) { // null = client closed the connection
                if (line.isBlank()) continue;
                boolean keepOpen;
                try {
                    keepOpen = handle(line);
                } catch (RuntimeException e) { // a bug in one command must not kill the server
                    ServerLog.log("Internal error for " + remote + ": " + e);
                    send(err(Protocol.E_BAD_REQUEST, "Internal error"));
                    keepOpen = true;
                }
                if (!keepOpen) break;
            }
        } catch (SocketTimeoutException e) {
            ServerLog.log("Idle timeout: " + remote);
        } catch (IOException e) {
            ServerLog.log("Connection problem " + remote + ": " + e.getMessage());
        } finally {
            cleanup();
        }
    }

    /** Reads one line, but refuses lines longer than MAX_LINE characters. */
    private String readLine() throws IOException {
        String line = in.readLine();
        if (line != null && line.length() > MAX_LINE) return "TOO_LONG";
        return line;
    }

    /** Executes one command. Returns false if the connection must be closed afterwards. */
    private boolean handle(String line) {
        String[] p = line.split("\\|", -1);
        String cmd = p[0].trim().toUpperCase();
        // Never log passwords: only the command name and (after login) the user are logged.
        ServerLog.log(remote + (username != null ? " [" + username + "]" : "") + " <- " + cmd);

        try {
            switch (cmd) {
                case Protocol.PING:
                    send(Protocol.OK + "|PONG");
                    return true;

                case Protocol.REGISTER:
                    if (p.length < 4) return bad("Usage: REGISTER|user|pass|fullName");
                    // fullName may not contain '|' (it would be split), so join any extra parts back
                    service.register(p[1], p[2], String.join(" ", java.util.Arrays.copyOfRange(p, 3, p.length)));
                    send(Protocol.OK + "|REGISTER|" + p[1].trim().toLowerCase());
                    return true;

                case Protocol.LOGIN:
                    if (p.length != 3) return bad("Usage: LOGIN|user|pass");
                    if (username != null) return bad("Already logged in");
                    String tok = service.login(p[1], p[2]);
                    String user = service.userOf(tok);
                    long bal = service.balance(user);
                    this.token = tok;
                    this.username = user;
                    server.register(user, this); // from now on EVENTs are pushed to us
                    send(Protocol.OK + "|LOGIN|" + user + "|" + bal);
                    return true;

                case Protocol.LOGOUT:
                    send(Protocol.OK + "|LOGOUT");
                    return false; // run() then closes the connection

                default:
                    break;
            }

            // All remaining commands need a logged-in user.
            boolean known = cmd.equals(Protocol.BALANCE) || cmd.equals(Protocol.DEPOSIT)
                    || cmd.equals(Protocol.TRANSFER) || cmd.equals(Protocol.HISTORY);
            if (!known) return bad("Unknown command");
            if (username == null) {
                send(err(Protocol.E_NOT_LOGGED_IN, "Please LOGIN first"));
                return true;
            }

            switch (cmd) {
                case Protocol.BALANCE:
                    send(Protocol.OK + "|BALANCE|" + service.balance(username));
                    break;
                case Protocol.DEPOSIT: {
                    if (p.length != 2) return bad("Usage: DEPOSIT|cents");
                    Long cents = parseLong(p[1]);
                    if (cents == null) return invalidAmount();
                    Transaction t = service.deposit(username, cents);
                    send(Protocol.OK + "|DEPOSIT|" + t.getId() + "|" + service.balance(username));
                    break;
                }
                case Protocol.TRANSFER: {
                    if (p.length < 3) return bad("Usage: TRANSFER|toUser|cents|note");
                    Long cents = parseLong(p[2]);
                    if (cents == null) return invalidAmount();
                    String note = p.length > 3 ? String.join(" ", java.util.Arrays.copyOfRange(p, 3, p.length)) : "";
                    Transaction t = service.transfer(username, p[1], cents, note);
                    send(Protocol.OK + "|TRANSFER|" + t.getId() + "|" + service.balance(username));
                    break;
                }
                case Protocol.HISTORY: {
                    int limit = 20;
                    if (p.length > 1 && !p[1].isBlank()) {
                        Long l = parseLong(p[1]);
                        if (l == null || l < 0) return bad("HISTORY limit must be a number");
                        limit = (int) Math.min(l, 1000);
                    }
                    List<Transaction> list = service.history(username, limit);
                    // Send header + all lines in ONE synchronized block so EVENTs cannot slip in between.
                    StringBuilder sb = new StringBuilder(Protocol.OK + "|HISTORY|" + list.size());
                    for (Transaction t : list) sb.append('\n').append(Protocol.TX).append('|').append(t.toWire());
                    send(sb.toString());
                    break;
                }
                default:
                    return bad("Unknown command");
            }
        } catch (PayNetException e) {
            send(err(e.getCode(), e.getMessage()));
        }
        return true;
    }

    // ---- small helpers ----

    private boolean bad(String msg) {
        send(err(Protocol.E_BAD_REQUEST, msg));
        return true;
    }

    private boolean invalidAmount() {
        send(err(Protocol.E_AMOUNT, "Amount must be a whole number of cents"));
        return true;
    }

    private static Long parseLong(String s) {
        try { return Long.parseLong(s.trim()); } catch (NumberFormatException e) { return null; }
    }

    private static String err(String code, String msg) {
        return Protocol.ERR + "|" + code + "|" + Transaction.clean(msg);
    }

    /**
     * Sends text (one or more lines separated by \n) to this client. synchronized on writeLock:
     * the handler thread (replies) and payment threads (events) both call it, and the lock makes
     * sure one complete message is written before the next one starts. Errors only close this client.
     */
    void send(String text) {
        if (closed) return;
        synchronized (writeLock) {
            try {
                out.write(text);
                out.write('\n');
                out.flush();
            } catch (IOException e) {
                close(); // broken connection: the reader thread will notice and clean up
            }
        }
    }

    /** Closes the socket (also unblocks a thread waiting in readLine()). */
    void close() {
        closed = true;
        try { socket.close(); } catch (IOException ignored) { }
    }

    /** Always runs at the end: unregister from the push list, end the session, close the socket. */
    private void cleanup() {
        server.unregister(username, this);
        if (token != null) service.logout(token);
        close();
        ServerLog.log("Client disconnected: " + remote + (username != null ? " [" + username + "]" : ""));
    }
}
