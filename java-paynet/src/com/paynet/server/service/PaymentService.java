package com.paynet.server.service;

import com.paynet.common.PayNetException;
import com.paynet.common.Transaction;
import java.util.List;

/**
 * The single business-logic layer. Both the TCP server and the web (HTTP) server call ONLY this interface.
 * Implementation must be thread-safe. Amounts are in cents. New accounts get a demo balance of 100000 cents
 * (credited as a deposit from "SYSTEM").
 */
public interface PaymentService {
    /** Creates an account. Codes: USER_EXISTS, BAD_REQUEST (empty/invalid names: username 3-20 letters/digits/_ , password >= 4 chars). */
    void register(String username, String password, String fullName) throws PayNetException;

    /** Returns a session token (random string). Code: AUTH_FAILED. */
    String login(String username, String password) throws PayNetException;

    void logout(String token);

    /** Username owning this token, or null if invalid. */
    String userOf(String token);

    /** Code: NO_SUCH_USER. */
    long balance(String username) throws PayNetException;

    /** Adds money from "SYSTEM". Code: INVALID_AMOUNT (<=0). */
    Transaction deposit(String username, long cents) throws PayNetException;

    /** Atomic transfer. Codes: INVALID_AMOUNT, NO_SUCH_USER, SELF_TRANSFER, INSUFFICIENT_FUNDS. */
    Transaction transfer(String from, String to, long cents, String note) throws PayNetException;

    /** Newest first, max 'limit' items, only transactions where user is sender or receiver. */
    List<Transaction> history(String username, int limit) throws PayNetException;

    void addListener(PaymentListener l);
    void removeListener(PaymentListener l);
}
