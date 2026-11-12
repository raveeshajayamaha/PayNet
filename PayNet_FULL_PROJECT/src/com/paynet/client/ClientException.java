package com.paynet.client;

/** Thrown when the server answers ERR|CODE|message, or when the connection fails. */
public class ClientException extends Exception {
    private static final long serialVersionUID = 1L;
    private final String code; // e.g. INSUFFICIENT_FUNDS, or local codes NETWORK / TIMEOUT

    public ClientException(String code, String message) {
        super(message);
        this.code = code;
    }

    /** The machine-readable error code (see com.paynet.common.Protocol). */
    public String getCode() { return code; }
}
