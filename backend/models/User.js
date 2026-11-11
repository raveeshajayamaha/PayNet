const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 200 },
  email: {
    type: String, required: true, trim: true, lowercase: true,
    maxlength: 254, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user', required: true },
  isActive: { type: Boolean, default: true, required: true },
  authVersion: { type: Number, default: 0, select: false },
}, { timestamps: true, bufferCommands: false, autoCreate: false, autoIndex: false });

userSchema.set('toJSON', { transform: (doc, value) => { delete value.passwordHash; delete value.authVersion; return value; } });

userSchema.index({ email: 1 }, { unique: true, name: 'unique_user_email' });

module.exports = mongoose.model('User', userSchema);
