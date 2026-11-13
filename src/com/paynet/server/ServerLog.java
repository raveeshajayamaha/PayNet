package com.paynet.server;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

/** Tiny logging helper: prints a line with a time stamp. Never pass passwords to it. */
public final class ServerLog {
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("HH:mm:ss.SSS");

    private ServerLog() {}

    /** synchronized so lines from different threads are not mixed together. */
    public static synchronized void log(String msg) {
        System.out.println("[" + LocalTime.now().format(FMT) + "] [" + Thread.currentThread().getName() + "] " + msg);
    }
}
