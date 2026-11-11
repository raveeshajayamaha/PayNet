const { randomUUID, createHash } = require('node:crypto');
const { withDatabaseTransaction } = require('./databaseTransaction');
const { AppError } = require('../utils/errors');
const { formatLkrCents } = require('../utils/money');
const MAX_BALANCE_CENTS = 1000000000000;
const DEMO_FUNDING_CAP_CENTS = 1000000;
const failures = {
  INSUFFICIENT_FUNDS: 'Insufficient available balance.', SELF_TRANSFER: 'Choose another recipient.',
  RECIPIENT_UNAVAILABLE: 'Recipient is unavailable.', WALLET_LIMIT: 'Wallet balance limit reached.',
  DEMO_FUNDING_LIMIT: 'This wallet has reached its lifetime demo funding limit.',
};

function createPayments(db, { publish = async () => {}, logger = console, beforeCommit } = {}) {
  const { Transaction, Wallet, User, Notification } = db.models;
  const existing = async (scope, fingerprint, session) => {
    const record = await Transaction.findOne(scope).select('+requestFingerprint').session(session || null);
    if (record && record.requestFingerprint !== fingerprint) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different request.');
    return record ? { transaction: record, replayed: true, notifications: [] } : null;
  };
  async function process(userId, input, key, funding = false) {
    const type = funding ? 'DEMO_FUNDING' : 'TRANSFER';
    const scope = { initiatorUserId: userId, idempotencyKey: key };
    const fingerprint = createHash('sha256').update(JSON.stringify({ type, ...input })).digest('hex');
    const referenceNumber = `PN-${randomUUID()}`;
    const base = { ...scope, requestFingerprint: fingerprint, referenceNumber, type, currency: 'LKR', amountCents: input.amountCents, description: input.description || '', recipientEmail: input.recipientEmail };
    let result;
    try {
      result = await withDatabaseTransaction(async (session) => {
        const replay = await existing(scope, fingerprint, session);
        if (replay) return replay;
        const sender = await Wallet.findOne({ userId }).session(session);
        if (!sender) throw new AppError(503, 'WALLET_UNAVAILABLE', 'Wallet unavailable.');
        // Claim the unique key inside the same transaction as all financial writes.
        const [record] = await Transaction.create([{ ...base, senderWalletId: funding ? undefined : sender._id, status: 'PENDING' }], { session });
        let receiver = sender, recipient = null;
        if (funding) {
          const funded = await Wallet.findOneAndUpdate({
            _id: sender._id, userId,
            balanceCents: { $lte: MAX_BALANCE_CENTS - input.amountCents },
            demoFundingUsedCents: { $lte: DEMO_FUNDING_CAP_CENTS - input.amountCents },
          }, { $inc: { balanceCents: input.amountCents, demoFundingUsedCents: input.amountCents } }, { returnDocument: 'after', session });
          if (!funded) throw new AppError(409, 'DEMO_FUNDING_LIMIT', failures.DEMO_FUNDING_LIMIT);
        } else {
          recipient = await User.findOne({ email: input.recipientEmail, isActive: true }).session(session);
          if (!recipient) throw new AppError(404, 'RECIPIENT_UNAVAILABLE', failures.RECIPIENT_UNAVAILABLE);
          if (String(recipient._id) === String(userId)) throw new AppError(400, 'SELF_TRANSFER', failures.SELF_TRANSFER);
          receiver = await Wallet.findOne({ userId: recipient._id, currency: 'LKR' }).session(session);
          if (!receiver) throw new AppError(404, 'RECIPIENT_UNAVAILABLE', failures.RECIPIENT_UNAVAILABLE);
          const debited = await Wallet.updateOne({ _id: sender._id, currency: 'LKR', balanceCents: { $gte: input.amountCents } }, { $inc: { balanceCents: -input.amountCents } }, { session });
          if (debited.modifiedCount !== 1) throw new AppError(409, 'INSUFFICIENT_FUNDS', failures.INSUFFICIENT_FUNDS);
          const credited = await Wallet.updateOne({ _id: receiver._id, currency: 'LKR', balanceCents: { $lte: MAX_BALANCE_CENTS - input.amountCents } }, { $inc: { balanceCents: input.amountCents } }, { session });
          if (credited.modifiedCount !== 1) throw new AppError(409, 'WALLET_LIMIT', failures.WALLET_LIMIT);
        }
        record.receiverWalletId = receiver._id;
        record.status = 'COMPLETED'; record.completedAt = new Date();
        await record.save({ session });
        const amount = `LKR ${formatLkrCents(input.amountCents)}`;
        const notificationData = funding ? [{ userId, title: 'Demo wallet funded', message: `${amount} in virtual funds was added.`, type: 'SYSTEM', transactionId: record._id }] : [
          { userId, title: 'Payment sent', message: `${amount} sent. Reference ${referenceNumber}.`, type: 'PAYMENT_SENT', transactionId: record._id },
          { userId: recipient._id, title: 'Payment received', message: `${amount} received. Reference ${referenceNumber}.`, type: 'PAYMENT_RECEIVED', transactionId: record._id },
        ];
        const notifications = await Notification.create(notificationData, { session, ordered: true });
        // Server-only fault injection used by rollback tests, never by requests/env.
        if (beforeCommit) await beforeCommit({ session, record });
        return { transaction: record, notifications, replayed: false };
      }, db);
    } catch (error) {
      if (error.code === 11000) {
        result = await existing(scope, fingerprint);
        if (!result) throw error;
      } else if (error instanceof AppError && Object.hasOwn(failures, error.code)) {
        // The financial transaction has definitely aborted. Persist the failed
        // outcome separately, with the same unique key, without changing money.
        try {
          result = await withDatabaseTransaction(async (session) => {
            const replay = await existing(scope, fingerprint, session);
            if (replay) return replay;
            const sender = await Wallet.findOne({ userId }).session(session);
            const [record] = await Transaction.create([{ ...base, senderWalletId: sender?._id, status: 'FAILED', failureCode: error.code }], { session });
            const notifications = await Notification.create([{ userId, title: 'Transaction failed', message: `${failures[error.code]} Reference ${referenceNumber}.`, type: 'TRANSACTION_FAILED', transactionId: record._id }], { session });
            return { transaction: record, notifications, replayed: false };
          }, db);
        } catch (failure) {
          if (failure.code !== 11000) throw failure;
          result = await existing(scope, fingerprint);
          if (!result) throw failure;
        }
      } else {
        // Never assert that money did not move after a network/unknown commit error.
        if (error instanceof AppError) throw error;
        throw new AppError(503, 'PAYMENT_OUTCOME_UNKNOWN', 'Could not confirm the outcome. Retry with the same idempotency key.');
      }
    }
    // Publication failure must never turn a committed payment into an API failure.
    if (!result.replayed) {
      try { await publish(result); } catch { logger.warn('[payments] live update unavailable; persisted updates remain available'); }
    }
    if (result.transaction.status === 'FAILED') {
      const code = result.transaction.failureCode;
      throw new AppError(code === 'RECIPIENT_UNAVAILABLE' ? 404 : code === 'SELF_TRANSFER' ? 400 : 409, code, failures[code], { referenceNumber: result.transaction.referenceNumber, status: 'FAILED', replayed: result.replayed });
    }
    return result;
  }
  return { send: (userId, input, key) => process(userId, input, key), fund: (userId, input, key) => process(userId, input, key, true) };
}
module.exports = { createPayments, MAX_BALANCE_CENTS, DEMO_FUNDING_CAP_CENTS };
