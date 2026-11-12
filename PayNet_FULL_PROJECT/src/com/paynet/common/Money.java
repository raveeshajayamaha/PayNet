package com.paynet.common;

/** Money is always stored as a long number of cents to avoid floating point errors. */
public final class Money {
    private Money() {}

    /** "1250" cents -> "12.50" */
    public static String format(long cents) {
        String sign = cents < 0 ? "-" : "";
        long abs = Math.abs(cents);
        return String.format("%s%d.%02d", sign, abs / 100, abs % 100);
    }

    /** "12.5" or "12.50" or "12" -> 1250. Throws NumberFormatException if invalid. */
    public static long parse(String text) {
        java.math.BigDecimal bd = new java.math.BigDecimal(text.trim());
        if (bd.scale() > 2) throw new NumberFormatException("Max 2 decimal places");
        return bd.movePointRight(2).longValueExact();
    }
}
