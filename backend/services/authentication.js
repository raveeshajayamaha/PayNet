const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const { withDatabaseTransaction } = require('./databaseTransaction');
const { AppError } = require('../utils/errors');

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const userDto = (user) => ({ id: String(user._id), fullName: user.fullName, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt });
const walletDto = (wallet) => ({ id: String(wallet._id), userId: String(wallet.userId), balanceCents: wallet.balanceCents, currency: wallet.currency, createdAt: wallet.createdAt });
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function createAuthentication(db, config) {
  const { User, Wallet, Session } = db.models;
  const csrfToken = (sessionId) => createHmac('sha256', config.secret).update(`csrf:${sessionId}`).digest('hex');
  const issue = async (user, session, persistent = false) => {
    const sid = new mongoose.Types.ObjectId();
    const token = jwt.sign({ sid: String(sid), version: user.authVersion || 0 }, config.secret, {
      algorithm: 'HS256', subject: String(user._id), issuer: 'paynet', audience: 'paynet-web', expiresIn: config.seconds,
    });
    await Session.create([{ _id: sid, userId: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + config.seconds * 1000), persistent }], { session });
    return { token, persistent, csrfToken: csrfToken(String(sid)) };
  };
  const verify = async (token) => {
    if (!config.secret || !token || typeof token !== 'string') throw new AppError(401, 'AUTH_REQUIRED', 'Please log in.');
    let claims;
    try { claims = jwt.verify(token, config.secret, { algorithms: ['HS256'], issuer: 'paynet', audience: 'paynet-web' }); }
    catch { throw new AppError(401, 'AUTH_REQUIRED', 'Your session expired. Please log in.'); }
    if (!mongoose.isObjectIdOrHexString(claims.sub) || !mongoose.isObjectIdOrHexString(claims.sid)) throw new AppError(401, 'AUTH_REQUIRED', 'Please log in.');
    const session = await Session.findOne({ _id: claims.sid, userId: claims.sub, tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
    const user = session && await User.findById(claims.sub).select('+authVersion');
    if (!user || !user.isActive || user.authVersion !== claims.version) throw new AppError(401, 'AUTH_REQUIRED', 'Please log in.');
    return { user, sessionId: String(session._id), expiresAt: session.expiresAt, persistent: session.persistent, token };
  };
  const snapshot = async (user, sessionId) => {
    const wallet = await Wallet.findOne({ userId: user._id });
    if (!wallet) throw new AppError(503, 'WALLET_UNAVAILABLE', 'Wallet unavailable.');
    return { user: userDto(user), wallet: walletDto(wallet), csrfToken: csrfToken(sessionId) };
  };
  return {
    verify, issue, snapshot, csrfToken,
    checkCsrf: (value, sessionId) => same(value, csrfToken(sessionId)),
    async register(input, role = 'user') {
      const passwordHash = await bcrypt.hash(input.password, 12);
      const userId = new mongoose.Types.ObjectId();
      return withDatabaseTransaction(async (session) => {
        const [user] = await User.create([{ _id: userId, fullName: input.fullName, email: input.email, passwordHash, role }], { session });
        const [wallet] = await Wallet.create([{ userId }], { session });
        const credentials = await issue(user, session);
        return { user: userDto(user), wallet: walletDto(wallet), ...credentials };
      }, db);
    },
    async login(input) {
      const user = await User.findOne({ email: input.email }).select('+passwordHash +authVersion');
      // Run bcrypt even for unknown users to reduce simple account enumeration by timing.
      const valid = await bcrypt.compare(input.password, user?.passwordHash || '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW');
      if (!user || !valid || !user.isActive) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
      const credentials = await issue(user, undefined, input.rememberMe || false);
      const wallet = await Wallet.findOne({ userId: user._id });
      return { user: userDto(user), wallet: walletDto(wallet), ...credentials };
    },
    async changePassword(identity, input) {
      const prior = await User.findById(identity.user._id).select('+passwordHash +authVersion');
      if (!prior || !await bcrypt.compare(input.currentPassword, prior.passwordHash)) throw new AppError(401, 'INVALID_PASSWORD', 'Current password is incorrect.');
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      return withDatabaseTransaction(async (session) => {
        const user = await User.findOneAndUpdate({ _id: prior._id, passwordHash: prior.passwordHash, authVersion: prior.authVersion }, { $set: { passwordHash }, $inc: { authVersion: 1 } }, { returnDocument: 'after', session }).select('+authVersion');
        if (!user) throw new AppError(409, 'SESSION_CHANGED', 'Your account changed. Please log in again.');
        await Session.deleteMany({ userId: user._id }, { session });
        const credentials = await issue(user, session, identity.persistent);
        const wallet = await Wallet.findOne({ userId: user._id }).session(session);
        return { user: userDto(user), wallet: walletDto(wallet), ...credentials };
      }, db);
    },
  };
}
module.exports = { createAuthentication, userDto, walletDto };
