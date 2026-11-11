const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, maxlength: 100 },
  message: { type: String, required: true, maxlength: 500 },
  type: { type: String, enum: ['PAYMENT_SENT', 'PAYMENT_RECEIVED', 'TRANSACTION_FAILED', 'SYSTEM'], required: true },
  isRead: { type: Boolean, default: false, required: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
}, { timestamps: true, bufferCommands: false, autoCreate: false, autoIndex: false });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, isRead: 1 });
schema.index({ userId: 1, transactionId: 1, type: 1 }, { unique: true, partialFilterExpression: { transactionId: { $type: 'objectId' } } });
module.exports = mongoose.model('Notification', schema);
