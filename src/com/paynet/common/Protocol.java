package com.paynet.common;

/** Constants of the PayNet text protocol. See docs/PROTOCOL.md. One message = one line, fields split by '|'. */
public final class Protocol {
    private Protocol() {}

    public static final int TCP_PORT = 5000;
    public static final int HTTP_PORT = 8080;
    public static final String SEP = "|";

    // client -> server commands
    public static final String REGISTER = "REGISTER"; // REGISTER|user|pass|fullName
    public static final String LOGIN    = "LOGIN";    // LOGIN|user|pass
    public static final String BALANCE  = "BALANCE";  // BALANCE
    public static final String DEPOSIT  = "DEPOSIT";  // DEPOSIT|cents
    public static final String TRANSFER = "TRANSFER"; // TRANSFER|toUser|cents|note
    public static final String HISTORY  = "HISTORY";  // HISTORY|limit
    public static final String PING     = "PING";     // PING
    public static final String LOGOUT   = "LOGOUT";   // LOGOUT

    // server -> client
    public static final String OK    = "OK";    // OK|CMD|...payload
    public static final String ERR   = "ERR";   // ERR|CODE|message
    public static final String EVENT = "EVENT"; // EVENT|TX|<Transaction wire>  (pushed in real time)
    public static final String TX    = "TX";    // history lines: TX|<Transaction wire>

    // error codes
    public static final String E_BAD_REQUEST = "BAD_REQUEST";
    public static final String E_NOT_LOGGED_IN = "NOT_LOGGED_IN";
    public static final String E_AUTH = "AUTH_FAILED";
    public static final String E_EXISTS = "USER_EXISTS";
    public static final String E_NO_USER = "NO_SUCH_USER";
    public static final String E_FUNDS = "INSUFFICIENT_FUNDS";
    public static final String E_AMOUNT = "INVALID_AMOUNT";
    public static final String E_SELF = "SELF_TRANSFER";
}
