package com.paynet.web;

import com.paynet.common.PayNetException;
import com.paynet.common.Protocol;
import com.paynet.common.Transaction;
import com.paynet.server.service.PaymentListener;
import com.paynet.server.service.PaymentService;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * HTTP front-end of PayNet. It uses the JDK's built-in com.sun.net.httpserver.HttpServer.
 *
 * It does two jobs:
 *  1. Serves the static website (HTML/CSS/JS) from the "web" folder.
 *  2. Offers a small JSON REST API under /api/... that calls the SAME PaymentService
 *     as the TCP server, so both front-ends share the same accounts and money.
 *
 * Real-time updates use Server-Sent Events (SSE): the browser opens GET /api/stream and the
 * connection stays open; the server writes "event: tx" messages whenever money moves.
 */
public class WebServer {

    private final PaymentService service;
    private final int port;
    private final Path webRoot;

    private HttpServer http;
    private ExecutorService pool;

    /** All currently open SSE streams. A concurrent set because many threads add/remove. */
    private final Set<Stream> streams = ConcurrentHashMap.newKeySet();

    /** Statistics since server start (AtomicLong = safe to update from many threads). */
    private final AtomicLong txCount = new AtomicLong();
    private final AtomicLong txVolume = new AtomicLong();

    /** The ONE listener we register on the service. It is called after every transaction. */
    private final PaymentListener listener = this::onTransaction;

    public WebServer(PaymentService service, int port, Path webRoot) {
        this.service = service;
        this.port = port;
        this.webRoot = webRoot.toAbsolutePath().normalize();
    }

    // ------------------------------------------------------------------ start / stop

    public void start() throws IOException {
        http = HttpServer.create(new InetSocketAddress(port), 0);
        // Cached pool: a new thread per busy request. SSE streams keep a thread each while open.
        pool = Executors.newCachedThreadPool();
        http.setExecutor(pool);
        http.createContext("/", this::handle);   // one handler; we route by path ourselves
        service.addListener(listener);
        http.start();
        System.out.println("[web] listening on http://localhost:" + port + "  (static root: " + webRoot + ")");
    }

    public void stop() {
        service.removeListener(listener);
        for (Stream s : streams) s.close();      // wake up all SSE threads so they finish
        if (http != null) http.stop(0);
        if (pool != null) pool.shutdownNow();
    }

    // ------------------------------------------------------------------ real-time (SSE)

    /** One open browser connection that wants live events. */
    private static final class Stream {
        final String user;
        /** Messages waiting to be written. The payment thread only adds here, so it never blocks. */
        final BlockingQueue<String> queue = new LinkedBlockingQueue<>();
        volatile boolean closed = false;

        Stream(String user) { this.user = user; }

        void close() { closed = true; queue.offer(""); }   // "" wakes the writer thread
    }

    /** Called by the payment service after every transaction (must be fast, must not block). */
    private void onTransaction(Transaction t) {
        txCount.incrementAndGet();
        txVolume.addAndGet(t.getCents());
        String message = "event: tx\ndata: " + Json.tx(t) + "\n\n";   // SSE message format
        for (Stream s : streams) {
            // Only people involved in the transaction get it.
            if (s.user.equals(t.getFrom()) || s.user.equals(t.getTo())) s.queue.offer(message);
        }
    }

    /** Handles GET /api/stream?token=... Runs in its own pool thread for as long as the browser stays connected. */
    private void handleStream(HttpExchange ex) throws IOException {
        String user = service.userOf(queryParam(ex, "token"));
        if (user == null) { sendError(ex, 401, "UNAUTHORIZED", "Invalid or missing token"); return; }

        ex.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-cache");
        ex.getResponseHeaders().set("Connection", "keep-alive");
        ex.sendResponseHeaders(200, 0);          // length 0 = chunked, i.e. "no fixed length, keep going"

        Stream stream = new Stream(user);
        streams.add(stream);
        try (OutputStream out = ex.getResponseBody()) {
            write(out, ": connected\n\n");       // a comment line, makes the browser fire "open"
            while (!stream.closed) {
                // Wait up to 15 s for a message; if nothing arrives, send a keep-alive ping.
                String msg = stream.queue.poll(15, TimeUnit.SECONDS);
                if (stream.closed) break;
                if (msg == null) msg = "event: ping\ndata: {}\n\n";
                if (!msg.isEmpty()) write(out, msg);
            }
        } catch (IOException e) {
            // Browser closed the page: writing fails -> we just drop this stream.
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            streams.remove(stream);
        }
    }

    private static void write(OutputStream out, String text) throws IOException {
        out.write(text.getBytes(StandardCharsets.UTF_8));
        out.flush();                              // flush so the browser gets it immediately
    }

    // ------------------------------------------------------------------ routing

    private void handle(HttpExchange ex) throws IOException {
        try {
            String path = ex.getRequestURI().getPath();
            if (path.equals("/api/stream")) {
                if (!ex.getRequestMethod().equals("GET")) { sendError(ex, 405, "METHOD_NOT_ALLOWED", "Use GET"); return; }
                handleStream(ex);
            } else if (path.startsWith("/api/")) {
                handleApi(ex, path);
            } else {
                handleStatic(ex, path);
            }
        } catch (Exception e) {
            // Safety net so one bad request can never kill the server.
            try { sendError(ex, 500, "SERVER_ERROR", "Internal error: " + e.getMessage()); } catch (Exception ignored) { }
        } finally {
            ex.close();
        }
    }

    // ------------------------------------------------------------------ REST API

    private void handleApi(HttpExchange ex, String path) throws IOException {
        String method = ex.getRequestMethod();
        try {
            switch (path) {
                case "/api/stats":
                    if (!method.equals("GET")) { methodNotAllowed(ex); return; }
                    sendJson(ex, 200, "{\"online\":" + streams.size() + ",\"users\":" + streams.size()
                            + ",\"transactions\":" + txCount.get() + ",\"volume\":" + txVolume.get() + "}");
                    return;

                case "/api/register": {
                    if (!method.equals("POST")) { methodNotAllowed(ex); return; }
                    Map<String, String> b = readBody(ex);
                    service.register(str(b, "username"), str(b, "password"), str(b, "fullName"));
                    sendJson(ex, 200, "{\"ok\":true}");
                    return;
                }
                case "/api/login": {
                    if (!method.equals("POST")) { methodNotAllowed(ex); return; }
                    Map<String, String> b = readBody(ex);
                    String username = str(b, "username");
                    String token = service.login(username, str(b, "password"));
                    long bal = service.balance(username);
                    sendJson(ex, 200, "{\"token\":" + Json.quote(token) + ",\"username\":" + Json.quote(username)
                            + ",\"balance\":" + bal + "}");
                    return;
                }
                case "/api/logout": {
                    if (!method.equals("POST")) { methodNotAllowed(ex); return; }
                    String token = bearer(ex);
                    if (token != null) service.logout(token);
                    sendJson(ex, 200, "{\"ok\":true}");
                    return;
                }
                default:
                    break;
            }

            // Everything below needs a logged-in user.
            boolean known = path.equals("/api/balance") || path.equals("/api/deposit")
                    || path.equals("/api/transfer") || path.equals("/api/history");
            if (!known) { sendError(ex, 404, "NOT_FOUND", "Unknown API endpoint"); return; }

            String user = service.userOf(bearer(ex));
            if (user == null) {
                if (!isAllowedMethod(path, method)) { methodNotAllowed(ex); return; }
                sendError(ex, 401, "UNAUTHORIZED", "Please log in first");
                return;
            }
            if (!isAllowedMethod(path, method)) { methodNotAllowed(ex); return; }

            switch (path) {
                case "/api/balance":
                    sendJson(ex, 200, "{\"balance\":" + service.balance(user) + "}");
                    break;
                case "/api/deposit": {
                    Map<String, String> b = readBody(ex);
                    Transaction t = service.deposit(user, cents(b));
                    sendJson(ex, 200, "{\"transaction\":" + Json.tx(t) + ",\"balance\":" + service.balance(user) + "}");
                    break;
                }
                case "/api/transfer": {
                    Map<String, String> b = readBody(ex);
                    Transaction t = service.transfer(user, str(b, "to"), cents(b), str(b, "note"));
                    sendJson(ex, 200, "{\"transaction\":" + Json.tx(t) + ",\"balance\":" + service.balance(user) + "}");
                    break;
                }
                case "/api/history": {
                    int limit = 20;
                    String l = queryParam(ex, "limit");
                    if (l != null) {
                        try { limit = Math.max(1, Math.min(500, Integer.parseInt(l))); }
                        catch (NumberFormatException e) { throw new PayNetException(Protocol.E_BAD_REQUEST, "limit must be a number"); }
                    }
                    List<Transaction> list = service.history(user, limit);
                    sendJson(ex, 200, "{\"transactions\":" + Json.txArray(list) + "}");
                    break;
                }
                default:
                    break;
            }
        } catch (PayNetException e) {
            sendError(ex, 400, e.getCode(), e.getMessage());     // business error -> HTTP 400
        } catch (IllegalArgumentException e) {
            sendError(ex, 400, Protocol.E_BAD_REQUEST, e.getMessage());  // bad JSON / bad number
        }
    }

    /** /api/balance and /api/history are GET; deposit and transfer are POST. */
    private static boolean isAllowedMethod(String path, String method) {
        boolean wantsGet = path.equals("/api/balance") || path.equals("/api/history");
        return wantsGet ? method.equals("GET") : method.equals("POST");
    }

    private void methodNotAllowed(HttpExchange ex) throws IOException {
        sendError(ex, 405, "METHOD_NOT_ALLOWED", "Method not allowed for this endpoint");
    }

    /** Reads "Authorization: Bearer xyz" and returns "xyz" (or null). */
    private static String bearer(HttpExchange ex) {
        String h = ex.getRequestHeaders().getFirst("Authorization");
        if (h != null && h.regionMatches(true, 0, "Bearer ", 0, 7)) return h.substring(7).trim();
        return null;
    }

    /** Returns a value from the parsed JSON body, "" if missing (the service then reports BAD_REQUEST). */
    private static String str(Map<String, String> body, String key) {
        String v = body.get(key);
        return v == null ? "" : v;
    }

    /** Reads the "amount" field (cents). */
    private static long cents(Map<String, String> body) {
        try {
            return new java.math.BigDecimal(str(body, "amount")).longValueExact();
        } catch (ArithmeticException | NumberFormatException e) {
            throw new IllegalArgumentException("amount must be a whole number of cents");
        }
    }

    /** Reads the request body (max 64 KB) and parses it as a flat JSON object. */
    private static Map<String, String> readBody(HttpExchange ex) throws IOException {
        try (InputStream in = ex.getRequestBody()) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[2048];
            int n;
            while ((n = in.read(chunk)) > 0) {
                buf.write(chunk, 0, n);
                if (buf.size() > 65536) throw new IllegalArgumentException("Request too large");
            }
            return Json.parseFlat(buf.toString(StandardCharsets.UTF_8));
        }
    }

    /** Reads ?name=value from the URL (decoded), or null. */
    private static String queryParam(HttpExchange ex, String name) {
        String q = ex.getRequestURI().getRawQuery();
        if (q == null) return null;
        for (String pair : q.split("&")) {
            int i = pair.indexOf('=');
            String k = i < 0 ? pair : pair.substring(0, i);
            if (k.equals(name)) {
                return i < 0 ? "" : URLDecoder.decode(pair.substring(i + 1), StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static void sendJson(HttpExchange ex, int status, String json) throws IOException {
        sendBytes(ex, status, "application/json; charset=utf-8", json.getBytes(StandardCharsets.UTF_8));
    }

    private static void sendError(HttpExchange ex, int status, String code, String message) throws IOException {
        sendJson(ex, status, Json.error(code, message));
    }

    private static void sendBytes(HttpExchange ex, int status, String type, byte[] data) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.getResponseHeaders().set("Cache-Control", "no-cache");
        if (ex.getRequestMethod().equals("HEAD")) {
            ex.sendResponseHeaders(status, -1);
            return;
        }
        ex.sendResponseHeaders(status, data.length);
        try (OutputStream out = ex.getResponseBody()) { out.write(data); }
    }

    // ------------------------------------------------------------------ static files

    private static final Map<String, String> TYPES = new HashMap<>();
    static {
        TYPES.put("html", "text/html; charset=utf-8");
        TYPES.put("css", "text/css; charset=utf-8");
        TYPES.put("js", "application/javascript; charset=utf-8");
        TYPES.put("json", "application/json; charset=utf-8");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("png", "image/png");
        TYPES.put("jpg", "image/jpeg");
        TYPES.put("jpeg", "image/jpeg");
        TYPES.put("gif", "image/gif");
        TYPES.put("ico", "image/x-icon");
        TYPES.put("txt", "text/plain; charset=utf-8");
        TYPES.put("woff2", "font/woff2");
    }

    private void handleStatic(HttpExchange ex, String path) throws IOException {
        String m = ex.getRequestMethod();
        if (!m.equals("GET") && !m.equals("HEAD")) { methodNotAllowed(ex); return; }
        if (path.equals("/") || path.isEmpty()) path = "/index.html";   // default page

        // Path traversal protection: resolve the file, normalize away any "..", and
        // make sure the result is still INSIDE webRoot.
        Path file;
        try {
            String decoded = URLDecoder.decode(path.replace("+", "%2B"), StandardCharsets.UTF_8);
            if (decoded.indexOf('\0') >= 0) { sendError(ex, 404, "NOT_FOUND", "Not found"); return; }
            file = webRoot.resolve(decoded.substring(1)).normalize();
        } catch (IllegalArgumentException e) {
            sendError(ex, 404, "NOT_FOUND", "Not found");
            return;
        }
        if (!file.startsWith(webRoot) || !Files.isRegularFile(file)) {
            sendError(ex, 404, "NOT_FOUND", "File not found");
            return;
        }
        String name = file.getFileName().toString();
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
        String type = TYPES.getOrDefault(ext, "application/octet-stream");
        sendBytes(ex, 200, type, Files.readAllBytes(file));
    }
}
