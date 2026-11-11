const mongoose = require('mongoose');
const { MAX_CENTS, castCents } = require('../utils/money');

const transactionSchema = new mongoose.Schema({
  senderWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', index: true },
  receiverWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', index: true },
  // Positive integer cents, in the wallets' LKR currency.
  amountCents: {
    alias: 'amount',
    type: Number, cast: castCents, required: true, min: 1, max: MAX_CENTS,
    validate: { validator: Number.isSafeInteger, message: 'Amount must be safe integer cents.' },
  },
  currency: { type: String, enum: ['LKR'], default: 'LKR', required: true },
  type: { type: String, enum: ['TRANSFER', 'DEMO_FUNDING'], default: 'TRANSFER', required: true },
  status: { type: String, uppercase: true, enum: ['PENDING', 'COMPLETED', 'FAILED'], default: 'PENDING', required: true },
  referenceNumber: { type: String, required: true, trim: true, maxlength: 128, immutable: true },
  initiatorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  idempotencyKey: { type: String, maxlength: 128, immutable: true },
  requestFingerprint: { type: String, select: false },
  recipientEmail: { type: String, trim: true, lowercase: true },
  description: { type: String, default: '', maxlength: 180 },
  failureCode: String,
  completedAt: Date,
}, { timestamps: true, bufferCommands: false, autoCreate: false, autoIndex: false });

transactionSchema.index({ referenceNumber: 1 }, { unique: true, name: 'unique_transaction_reference' });
transactionSchema.index({ initiatorUserId: 1, idempotencyKey: 1 }, {
  unique: true, name: 'unique_user_idempotency', partialFilterExpression: { idempotencyKey: { $type: 'string' } },
});
transactionSchema.index({ senderWalletId: 1, createdAt: -1 });
transactionSchema.index({ receiverWalletId: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
