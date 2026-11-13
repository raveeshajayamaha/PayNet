package com.paynet.common;

/** One money movement. Immutable. Wire format: id|from|to|cents|timestampMillis|status|note */
public final class Transaction {
    public static final String STATUS_COMPLETED = "COMPLETED";

    private final long id;
    private final String from;   // "SYSTEM" for deposits
    private final String to;
    private final long cents;
    private final long timestamp;
    private final String status;
    private final String note;

    public Transaction(long id, String from, String to, long cents, long timestamp, String status, String note) {
        this.id = id; this.from = from; this.to = to; this.cents = cents;
        this.timestamp = timestamp; this.status = status; this.note = clean(note);
    }

    /** '|' and line breaks are not allowed inside the note because they are protocol separators. */
    public static String clean(String s) {
        if (s == null) return "";
        return s.replace('|', ' ').replace('\r', ' ').replace('\n', ' ').trim();
    }

    public long getId() { return id; }
    public String getFrom() { return from; }
    public String getTo() { return to; }
    public long getCents() { return cents; }
    public long getTimestamp() { return timestamp; }
    public String getStatus() { return status; }
    public String getNote() { return note; }

    public String toWire() {
        return id + "|" + from + "|" + to + "|" + cents + "|" + timestamp + "|" + status + "|" + note;
    }

    /** Parses the 7-field wire form (without any leading "TX|" / "EVENT|TX|" prefix). */
    public static Transaction fromWire(String s) {
        String[] p = s.split("\\|", 7);
        return new Transaction(Long.parseLong(p[0]), p[1], p[2], Long.parseLong(p[3]),
                Long.parseLong(p[4]), p[5], p.length > 6 ? p[6] : "");
    }

    @Override public String toString() { return "#" + id + " " + from + " -> " + to + " " + Money.format(cents); }
}
