package com.paynet.server.service;

import com.paynet.common.PayNetException;
import com.paynet.common.Protocol;
import com.paynet.common.Transaction;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Pattern;

/**
 * The business logic of PayNet. Used by BOTH the TCP server and the web server.
 *
 * THREAD SAFETY: many client threads call this class at the same time. All data that
 * changes money (accounts, balances, transaction list, files) is protected by ONE global
 * lock object (called LOCK). Only one thread at a time can be inside a "synchronized (LOCK)"
 * block, so a transfer (subtract from A + add to B + write to file) is atomic: nobody can
 * see the money "half moved". One global lock is simple and cannot dead-lock (there is
 * never a second lock to wait for), which is fine for a student-size system.
 *
 * PERSISTENCE: two text files in the data directory.
 *   users.csv        = username TAB salt TAB passwordHash TAB fullName TAB createdMillis
 *   transactions.csv = one Transaction wire line per row (id|from|to|cents|time|status|note)
 * Balances are NOT stored: they are recomputed from the transactions when the server starts.
 */
public class PaymentServiceImpl implements PaymentService {

    /** Every new account receives this demo money (1000.00). */
    public static final long WELCOME_BONUS_CENTS = 100000L;
    /** Sanity limit for one transfer or deposit: 1,000,000.00 = 100,000,000 cents. */
    public static final long MAX_AMOUNT_CENTS = 100_000_000L;
    private static final String SYSTEM = "SYSTEM";
    private static final Pattern USERNAME_RE = Pattern.compile("[A-Za-z0-9_]{3,20}");

    /** One account in memory. Only touched while holding LOCK. */
    private static final class Account {
        final String username;      // lower-case
        final String salt;          // random hex, different for each user
        final String hash;          // SHA-256(salt + password) as hex
        final String fullName;
        final long created;
        long balance;
        final List<Transaction> txs = new ArrayList<>(); // oldest first
        Account(String username, String salt, String hash, String fullName, long created) {
            this.username = username; this.salt = salt; this.hash = hash;
            this.fullName = fullName; this.created = created;
        }
    }

    private final Object LOCK = new Object();
    private final Map<String, Account> accounts = new HashMap<>();   // guarded by LOCK
    private long nextTxId = 1;                                       // guarded by LOCK
    private final BufferedWriter usersOut;                           // guarded by LOCK
    private final BufferedWriter txOut;                              // guarded by LOCK

    // token -> username. ConcurrentHashMap is itself thread-safe, so it needs no LOCK.
    private final Map<String, String> sessions = new ConcurrentHashMap<>();
    // CopyOnWriteArrayList: safe to loop over while another thread adds/removes a listener.
    private final List<PaymentListener> listeners = new CopyOnWriteArrayList<>();
    private final SecureRandom random = new SecureRandom(); // cryptographically strong random numbers

    public PaymentServiceImpl(Path dataDir) {
        try {
            Files.createDirectories(dataDir);
            Path usersFile = dataDir.resolve("users.csv");
            Path txFile = dataDir.resolve("transactions.csv");
            if (!Files.exists(usersFile)) Files.createFile(usersFile);
            if (!Files.exists(txFile)) Files.createFile(txFile);
            load(usersFile, txFile);
            // open in APPEND mode: each change adds one line at the end of the file
            usersOut = Files.newBufferedWriter(usersFile, StandardCharsets.UTF_8, StandardOpenOption.APPEND);
            txOut = Files.newBufferedWriter(txFile, StandardCharsets.UTF_8, StandardOpenOption.APPEND);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot open data directory " + dataDir, e);
        }
    }

    // ---------------------------------------------------------------- loading

    private void load(Path usersFile, Path txFile) throws IOException {
        for (String line : Files.readAllLines(usersFile, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            String[] p = line.split("\t", -1);
            if (p.length < 5) continue; // skip damaged line
            accounts.put(p[0], new Account(p[0], p[1], p[2], p[3], Long.parseLong(p[4])));
        }
        for (String line : Files.readAllLines(txFile, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            Transaction t;
            try { t = Transaction.fromWire(line); } catch (RuntimeException e) { continue; }
            Account from = accounts.get(t.getFrom());
            Account to = accounts.get(t.getTo());
            if (from != null) { from.balance -= t.getCents(); from.txs.add(t); }
            if (to != null) { to.balance += t.getCents(); to.txs.add(t); }
            if (t.getId() >= nextTxId) nextTxId = t.getId() + 1; // continue numbering after reload
        }
    }

    // ---------------------------------------------------------------- helpers

    private static String sha256Hex(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // every Java has SHA-256
        }
    }

    private String randomHex(int bytes) {
        byte[] b = new byte[bytes];
        random.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    private static String key(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    private static void writeLine(BufferedWriter w, String line) {
        try {
            w.write(line);
            w.newLine();
            w.flush(); // push to disk now so a crash does not lose it
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Creates + stores one transaction and updates balances. MUST be called while holding LOCK. */
    private Transaction record(String from, String to, long cents, String note) {
        Transaction t = new Transaction(nextTxId++, from, to, cents, System.currentTimeMillis(),
                Transaction.STATUS_COMPLETED, note);
        writeLine(txOut, t.toWire());
        Account a = accounts.get(from);
        Account b = accounts.get(to);
        if (a != null) { a.balance -= cents; a.txs.add(t); }
        if (b != null) { b.balance += cents; b.txs.add(t); }
        return t;
    }

    /** Tells every listener. Called AFTER the lock is released so slow listeners cannot block payments. */
    private void notifyListeners(Transaction t) {
        for (PaymentListener l : listeners) {
            try {
                l.onTransaction(t);
            } catch (RuntimeException e) {
                System.err.println("Listener failed: " + e); // one bad listener must not break others
            }
        }
    }

    private static void checkAmount(long cents) throws PayNetException {
        if (cents <= 0) throw new PayNetException(Protocol.E_AMOUNT, "Amount must be greater than zero");
        if (cents > MAX_AMOUNT_CENTS) throw new PayNetException(Protocol.E_AMOUNT, "Amount is above the limit of 1000000.00");
    }

    // ---------------------------------------------------------------- PaymentService

    @Override
    public void register(String username, String password, String fullName) throws PayNetException {
        String name = username == null ? "" : username.trim();
        if (!USERNAME_RE.matcher(name).matches())
            throw new PayNetException(Protocol.E_BAD_REQUEST, "Username must be 3-20 letters, digits or _");
        if (password == null || password.length() < 4)
            throw new PayNetException(Protocol.E_BAD_REQUEST, "Password must have at least 4 characters");
        String full = fullName == null ? "" : fullName.replaceAll("[\\t\\r\\n|]", " ").trim();
        if (full.isEmpty()) throw new PayNetException(Protocol.E_BAD_REQUEST, "Full name is required");
        String id = name.toLowerCase(Locale.ROOT);

        Transaction bonus;
        synchronized (LOCK) {
            if (accounts.containsKey(id))
                throw new PayNetException(Protocol.E_EXISTS, "Username already taken");
            String salt = randomHex(16);
            Account acc = new Account(id, salt, sha256Hex(salt + password), full, System.currentTimeMillis());
            writeLine(usersOut, id + "\t" + salt + "\t" + acc.hash + "\t" + full + "\t" + acc.created);
            accounts.put(id, acc);
            bonus = record(SYSTEM, id, WELCOME_BONUS_CENTS, "Welcome bonus");
        }
        notifyListeners(bonus);
    }

    @Override
    public String login(String username, String password) throws PayNetException {
        Account acc;
        synchronized (LOCK) { acc = accounts.get(key(username)); }
        // Same error for "no such user" and "wrong password" so attackers cannot find valid names.
        if (acc == null || password == null) throw new PayNetException(Protocol.E_AUTH, "Wrong username or password");
        byte[] expected = acc.hash.getBytes(StandardCharsets.UTF_8);
        byte[] actual = sha256Hex(acc.salt + password).getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, actual)) // constant-time comparison
            throw new PayNetException(Protocol.E_AUTH, "Wrong username or password");
        String token = randomHex(24);
        sessions.put(token, acc.username);
        return token;
    }

    @Override
    public void logout(String token) {
        if (token != null) sessions.remove(token);
    }

    @Override
    public String userOf(String token) {
        return token == null ? null : sessions.get(token);
    }

    @Override
    public long balance(String username) throws PayNetException {
        synchronized (LOCK) {
            Account a = accounts.get(key(username));
            if (a == null) throw new PayNetException(Protocol.E_NO_USER, "No such user");
            return a.balance;
        }
    }

    @Override
    public Transaction deposit(String username, long cents) throws PayNetException {
        checkAmount(cents);
        Transaction t;
        synchronized (LOCK) {
            String id = key(username);
            if (!accounts.containsKey(id)) throw new PayNetException(Protocol.E_NO_USER, "No such user");
            t = record(SYSTEM, id, cents, "Deposit");
        }
        notifyListeners(t);
        return t;
    }

    @Override
    public Transaction transfer(String from, String to, long cents, String note) throws PayNetException {
        checkAmount(cents);
        String f = key(from), r = key(to);
        Transaction t;
        synchronized (LOCK) { // atomic: check + subtract + add + save happen as ONE step
            Account a = accounts.get(f);
            if (a == null) throw new PayNetException(Protocol.E_NO_USER, "Sender does not exist");
            if (!accounts.containsKey(r)) throw new PayNetException(Protocol.E_NO_USER, "Receiver does not exist");
            if (f.equals(r)) throw new PayNetException(Protocol.E_SELF, "You cannot send money to yourself");
            if (a.balance < cents) throw new PayNetException(Protocol.E_FUNDS, "Insufficient funds");
            t = record(f, r, cents, note);
        }
        notifyListeners(t);
        return t;
    }

    @Override
    public List<Transaction> history(String username, int limit) throws PayNetException {
        synchronized (LOCK) {
            Account a = accounts.get(key(username));
            if (a == null) throw new PayNetException(Protocol.E_NO_USER, "No such user");
            int n = Math.max(0, Math.min(limit, a.txs.size()));
            List<Transaction> out = new ArrayList<>(n);
            for (int i = a.txs.size() - 1; i >= 0 && out.size() < n; i--) out.add(a.txs.get(i)); // newest first
            return out;
        }
    }

    @Override public void addListener(PaymentListener l) { if (l != null) listeners.add(l); }
    @Override public void removeListener(PaymentListener l) { listeners.remove(l); }
}
