const mongoose = require('mongoose');
const { MAX_CENTS, castCents } = require('../utils/money');

const walletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Integer cents, NOT LKR decimal units: 1050 means LKR 10.50.
  balanceCents: {
    alias: 'balance',
    type: Number, cast: castCents, required: true, default: 0, min: 0, max: MAX_CENTS,
    validate: { validator: Number.isSafeInteger, message: 'Balance must be safe integer cents.' },
  },
  currency: { type: String, enum: ['LKR'], default: 'LKR', required: true },
  demoFundingUsedCents: { type: Number, cast: castCents, default: 0, min: 0, max: 1000000 },
}, { timestamps: true, bufferCommands: false, autoCreate: false, autoIndex: false });

// PayNet currently supports one LKR wallet per user.
walletSchema.index({ userId: 1 }, { unique: true, name: 'unique_user_wallet' });

module.exports = mongoose.model('Wallet', walletSchema);
