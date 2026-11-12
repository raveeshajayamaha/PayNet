package com.paynet.server;

import com.paynet.common.Protocol;
import com.paynet.common.Transaction;
import com.paynet.server.service.PaymentListener;
import com.paynet.server.service.PaymentService;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The TCP server (default port 5000).
 *
 * THREADS: the thread that calls start() returns at once. A separate "accept thread" sits in
 * ServerSocket.accept() and waits for clients. For every new client it hands a ClientHandler
 * to a thread pool, so each client is served by its own thread and a slow client cannot
 * block the others.
 *
 * REAL-TIME PUSH: the server registers ONE PaymentListener on the PaymentService. After any
 * transaction (from TCP or from the website) the service calls it, and we send
 * "EVENT|TX|..." to every open connection of the sender and the receiver.
 */
public class TcpServer {
    private final PaymentService service;
    private final int port;
    private ServerSocket serverSocket;
    private ExecutorService pool;
    private volatile boolean running;
    private final PaymentListener listener = this::pushEvent;

    /**
     * username -> set of logged-in handlers. ConcurrentHashMap + concurrent set because the
     * accept threads, client threads and payment threads all use it at the same time.
     */
    private final Map<String, Set<ClientHandler>> online = new ConcurrentHashMap<>();

    public TcpServer(PaymentService service, int port) {
        this.service = service;
        this.port = port;
    }

    /** Opens the port and starts the accept loop on its own thread. Does not block the caller. */
    public synchronized void start() throws IOException {
        if (running) return;
        serverSocket = new ServerSocket(port); // binds the port; throws if already in use
        pool = Executors.newCachedThreadPool(); // creates threads as needed, reuses idle ones
        running = true;
        service.addListener(listener);
        Thread acceptThread = new Thread(this::acceptLoop, "tcp-accept");
        acceptThread.setDaemon(false); // keeps the JVM alive
        acceptThread.start();
        ServerLog.log("TCP server listening on port " + getPort());
    }

    /** The real port (useful when constructed with port 0 = "pick any free port"). */
    public int getPort() {
        return serverSocket == null ? port : serverSocket.getLocalPort();
    }

    private void acceptLoop() {
        while (running) {
            try {
                Socket s = serverSocket.accept(); // blocks until a client connects
                pool.execute(new ClientHandler(s, service, this));
            } catch (IOException e) {
                if (running) ServerLog.log("Accept error: " + e.getMessage()); // closed socket on stop() is normal
            } catch (RuntimeException e) {
                ServerLog.log("Unexpected accept error: " + e); // never let the loop die
            }
        }
    }

    /** Stops accepting, closes all client connections and the thread pool. */
    public synchronized void stop() {
        if (!running) return;
        running = false;
        service.removeListener(listener);
        try { serverSocket.close(); } catch (IOException ignored) { }
        for (Set<ClientHandler> set : online.values())
            for (ClientHandler h : set) h.close();
        online.clear();
        pool.shutdownNow(); // interrupts handler threads
        ServerLog.log("TCP server stopped");
    }

    // ---- registry of logged-in connections (called by ClientHandler) ----

    void register(String username, ClientHandler h) {
        online.computeIfAbsent(username, u -> ConcurrentHashMap.newKeySet()).add(h);
    }

    void unregister(String username, ClientHandler h) {
        if (username == null) return;
        Set<ClientHandler> set = online.get(username);
        if (set != null) set.remove(h);
    }

    /** Called by the service in the thread that made the payment. Must be quick and must not throw. */
    private void pushEvent(Transaction t) {
        String line = Protocol.EVENT + Protocol.SEP + Protocol.TX + Protocol.SEP + t.toWire();
        sendTo(t.getFrom(), line);
        if (!t.getTo().equals(t.getFrom())) sendTo(t.getTo(), line);
    }

    private void sendTo(String user, String line) {
        if (user == null || user.equals("SYSTEM")) return;
        Set<ClientHandler> set = online.get(user);
        if (set == null) return;
        for (ClientHandler h : set) h.send(line); // send() is synchronized per connection and catches errors
    }
}
