package com.paynet.common;

/** Business error with a short machine code (e.g. INSUFFICIENT_FUNDS) and a human message. */
public class PayNetException extends Exception {
    private static final long serialVersionUID = 1L;
    private final String code;

    public PayNetException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() { return code; }
}
