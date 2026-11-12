package com.paynet.server.service;

import com.paynet.common.Transaction;

/** Called (from the thread that did the payment) after every completed transaction. Must not block. */
public interface PaymentListener {
    void onTransaction(Transaction t);
}
