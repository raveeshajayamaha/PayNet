package com.paynet.client;

import com.paynet.common.Protocol;
import com.paynet.common.Transaction;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * TCP client for the PayNet protocol.
 *
 * How it works:
 *  - One background "reader" thread reads every line the server sends.
 *  - Lines starting with EVENT|TX|... are pushed events -> sent to the EventListener.
 *  - All other lines are replies to our commands -> put in a queue; the caller
 *    that sent the command waits on that queue (with a timeout).
 *  - Only one command is "in flight" at a time (method sendAndWait is synchronized),
 *    so each reply always belongs to the command that is waiting.
 */
public class NetClient {

    /** Callback interface for things the server pushes to us. */
    public interface EventListener {
        /** Called (from the reader thread!) when a new transaction involving us happens. */
        void onTransaction(Transaction t);
        /** Called (from the reader thread!) when the connection is lost. */
        void onDisconnected();
    }

    private static final int TIMEOUT_MS = 8000;
    /** Special marker put in the reply queue when the connection dies, to wake waiting callers. */
    private static final List<String> CLOSED = new ArrayList<>();

    private Socket socket;
    private BufferedReader in;
    private PrintWriter out;
    private Thread readerThread;
    private volatile EventListener listener;
    private volatile boolean closedByUs = false;
    private volatile boolean connected = false;

    /** Each element is one complete reply (1 line, or header + TX lines for HISTORY). */
    private final BlockingQueue<List<String>> replies = new LinkedBlockingQueue<>();

    public void setListener(EventListener l) { this.listener = l; }

    public boolean isConnected() { return connected; }

    // ------------------------------------------------------------------ connection

    /** Opens the socket and starts the reader thread. */
    public synchronized void connect(String host, int port) throws ClientException {
        close(); // make sure an old connection is gone
        try {
            socket = new Socket();
            socket.connect(new InetSocketAddress(host, port), 5000); // 5 s connect timeout
            in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            out = new PrintWriter(new BufferedWriter(
                    new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8)), true);
        } catch (IOException e) {
            closeQuietly();
            throw new ClientException("NETWORK", "Cannot connect to " + host + ":" + port + " (" + e.getMessage() + ")");
        }
        closedByUs = false;
        connected = true;
        replies.clear();
        readerThread = new Thread(this::readLoop, "paynet-reader");
        readerThread.setDaemon(true); // do not keep the JVM alive
        readerThread.start();
    }

    /** Runs in the background thread: reads lines until the socket closes. */
    private void readLoop() {
        try {
            String line;
            while ((line = in.readLine()) != null) {
                if (line.startsWith(Protocol.EVENT + "|")) {
                    handleEvent(line);
                } else if (line.startsWith(Protocol.OK + "|" + Protocol.HISTORY + "|")) {
                    readHistory(line);
                } else {
                    List<String> r = new ArrayList<>();
                    r.add(line);
                    replies.add(r);
                }
            }
        } catch (IOException e) {
            // socket closed or broken: fall through to cleanup
        }
        connected = false;
        replies.add(CLOSED); // wake up anybody waiting for a reply
        EventListener l = listener;
        if (!closedByUs && l != null) l.onDisconnected();
    }

    /** HISTORY reply: header "OK|HISTORY|n" followed by n lines "TX|...". */
    private void readHistory(String header) throws IOException {
        List<String> r = new ArrayList<>();
        r.add(header);
        int n;
        try {
            n = Integer.parseInt(header.split("\\|")[2]);
        } catch (RuntimeException e) {
            n = 0;
        }
        while (r.size() < n + 1) {
            String line = in.readLine();
            if (line == null) throw new IOException("closed during history");
            if (line.startsWith(Protocol.EVENT + "|")) handleEvent(line); // events may arrive in between
            else r.add(line);
        }
        replies.add(r);
    }

    /** Turns "EVENT|TX|id|from|..." into a Transaction and tells the listener. */
    private void handleEvent(String line) {
        String[] p = line.split("\\|", 3);
        if (p.length < 3 || !Protocol.TX.equals(p[1])) return;
        EventListener l = listener;
        if (l == null) return;
        try {
            l.onTransaction(Transaction.fromWire(p[2]));
        } catch (RuntimeException e) {
            // ignore malformed event lines
        }
    }

    // ------------------------------------------------------------------ request / response

    /** Sends one command line and waits for its reply. Only one request at a time. */
    private synchronized List<String> sendAndWait(String command) throws ClientException {
        if (!connected) throw new ClientException("NETWORK", "Not connected");
        replies.clear(); // drop anything stale
        out.println(command);
        if (out.checkError()) throw new ClientException("NETWORK", "Could not send to server");
        List<String> reply;
        try {
            reply = replies.poll(TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ClientException("NETWORK", "Interrupted");
        }
        if (reply == null) {
            // A late reply would be mixed up with the next command, so we drop the connection.
            close();
            throw new ClientException("TIMEOUT", "Server did not answer in time");
        }
        if (reply == CLOSED) throw new ClientException("NETWORK", "Connection closed by server");
        String first = reply.get(0);
        String[] p = first.split("\\|", 3);
        if (Protocol.ERR.equals(p[0])) {
            throw new ClientException(p.length > 1 ? p[1] : "ERROR", p.length > 2 ? p[2] : first);
        }
        return reply;
    }

    /** Splits the first reply line into fields: OK|CMD|a|b -> [OK, CMD, a, b]. */
    private static String[] fields(List<String> reply) {
        return reply.get(0).split("\\|", -1);
    }

    private static long num(String s) throws ClientException {
        try { return Long.parseLong(s); }
        catch (NumberFormatException e) { throw new ClientException("BAD_REPLY", "Bad number from server: " + s); }
    }

    // ------------------------------------------------------------------ commands

    /** Creates a new account. Fields must not contain '|'. */
    public void register(String user, String pass, String fullName) throws ClientException {
        sendAndWait(Protocol.REGISTER + "|" + clean(user) + "|" + clean(pass) + "|" + clean(fullName));
    }

    /** Logs in; returns the current balance in cents. */
    public long login(String user, String pass) throws ClientException {
        String[] f = fields(sendAndWait(Protocol.LOGIN + "|" + clean(user) + "|" + clean(pass)));
        if (f.length < 4) throw new ClientException("BAD_REPLY", "Bad LOGIN reply");
        return num(f[3]);
    }

    /** Returns the balance in cents. */
    public long balance() throws ClientException {
        String[] f = fields(sendAndWait(Protocol.BALANCE));
        if (f.length < 3) throw new ClientException("BAD_REPLY", "Bad BALANCE reply");
        return num(f[2]);
    }

    /** Adds money to our account; returns the new balance in cents. */
    public long deposit(long cents) throws ClientException {
        String[] f = fields(sendAndWait(Protocol.DEPOSIT + "|" + cents));
        if (f.length < 4) throw new ClientException("BAD_REPLY", "Bad DEPOSIT reply");
        return num(f[3]);
    }

    /** Sends money to another user; returns our new balance in cents. */
    public long transfer(String to, long cents, String note) throws ClientException {
        String[] f = fields(sendAndWait(Protocol.TRANSFER + "|" + clean(to) + "|" + cents + "|" + Transaction.clean(note)));
        if (f.length < 4) throw new ClientException("BAD_REPLY", "Bad TRANSFER reply");
        return num(f[3]);
    }

    /** Returns the last 'limit' transactions, newest first. */
    public List<Transaction> history(int limit) throws ClientException {
        List<String> reply = sendAndWait(Protocol.HISTORY + "|" + limit);
        List<Transaction> result = new ArrayList<>();
        for (int i = 1; i < reply.size(); i++) {
            String line = reply.get(i);
            if (line.startsWith(Protocol.TX + "|")) {
                try {
                    result.add(Transaction.fromWire(line.substring(Protocol.TX.length() + 1)));
                } catch (RuntimeException e) {
                    // skip a malformed line
                }
            }
        }
        return result;
    }

    /** Tells the server we leave, then closes the socket. */
    public void logout() {
        try {
            sendAndWait(Protocol.LOGOUT);
        } catch (ClientException e) {
            // we are closing anyway
        }
        close();
    }

    /** Closes the connection (safe to call many times). */
    public synchronized void close() {
        closedByUs = true;
        connected = false;
        closeQuietly();
    }

    private void closeQuietly() {
        try { if (socket != null) socket.close(); } catch (IOException ignored) { }
    }

    /** '|' and line breaks would break the protocol, so replace them. */
    private static String clean(String s) {
        return Transaction.clean(s);
    }
}
