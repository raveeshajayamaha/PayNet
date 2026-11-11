const { AppError } = require('../utils/errors');
const { userDto, walletDto } = require('./authentication');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const notificationDto = (n) => ({ id: String(n._id), title: n.title, message: n.message, type: n.type, isRead: n.isRead, transactionId: n.transactionId ? String(n.transactionId) : null, createdAt: n.createdAt });
function createQueries(db) {
  const { Wallet, User, Transaction, Notification } = db.models;
  const populated = (query) => query.populate({ path: 'senderWalletId receiverWalletId', populate: { path: 'userId', select: 'fullName email' } });
  function transactionDto(t, ownWalletId) {
    const sender = t.senderWalletId, receiver = t.receiverWalletId;
    const owner = (wallet) => wallet?.userId?.fullName ? { id: String(wallet.userId._id), fullName: wallet.userId.fullName, email: wallet.userId.email } : null;
    return {
      id: String(t._id), referenceNumber: t.referenceNumber, amountCents: t.amountCents, currency: t.currency,
      type: t.type, direction: ownWalletId ? (String(receiver?._id) === String(ownWalletId) ? 'incoming' : 'outgoing') : null,
      status: t.status, description: t.description, sender: owner(sender), receiver: owner(receiver),
      recipientEmail: t.recipientEmail, createdAt: t.createdAt, completedAt: t.completedAt || null,
    };
  }
  async function walletFor(userId) {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) throw new AppError(503, 'WALLET_UNAVAILABLE', 'Wallet unavailable.');
    return wallet;
  }
  function filters(options, wallet) {
    const query = {};
    if (wallet) {
      if (options.type === 'incoming') query.receiverWalletId = wallet._id;
      else if (options.type === 'outgoing') query.senderWalletId = wallet._id;
      else query.$or = [{ senderWalletId: wallet._id }, { receiverWalletId: wallet._id }];
    }
    if (options.status) query.status = options.status;
    if (options.from || options.to) {
      query.createdAt = {};
      if (options.from) query.createdAt.$gte = new Date(options.from);
      if (options.to) query.createdAt.$lt = new Date(new Date(options.to).getTime() + 86400000);
    }
    return query;
  }
  async function listTransactions(userId, options, admin = false) {
    const wallet = admin ? null : await walletFor(userId);
    const query = filters(options, wallet);
    if (options.search) {
      const regex = new RegExp(escapeRegex(options.search), 'i');
      // Only public counterparty fields participate; password/session data never enter results.
      const users = await User.find({ $or: [{ fullName: regex }, { email: regex }] }).select('_id').limit(1000);
      const wallets = await Wallet.find({ userId: { $in: users.map((u) => u._id) } }).select('_id');
      query.$and = [{ $or: [
        { referenceNumber: regex }, { description: regex }, { recipientEmail: regex },
        { senderWalletId: { $in: wallets.map((w) => w._id) } }, { receiverWalletId: { $in: wallets.map((w) => w._id) } },
      ] }];
    }
    const sort = { newest: { createdAt: -1, _id: -1 }, oldest: { createdAt: 1, _id: 1 }, 'amount-asc': { amountCents: 1, _id: -1 }, 'amount-desc': { amountCents: -1, _id: -1 } }[options.sort || 'newest'];
    const [total, records] = await Promise.all([
      Transaction.countDocuments(query), populated(Transaction.find(query).sort(sort).skip((options.page - 1) * options.limit).limit(options.limit)),
    ]);
    return { items: records.map((t) => transactionDto(t, wallet?._id)), page: options.page, limit: options.limit, total, pages: Math.max(1, Math.ceil(total / options.limit)) };
  }
  async function transaction(userId, id, admin = false) {
    const wallet = admin ? null : await walletFor(userId);
    const query = { _id: id, ...(wallet ? { $or: [{ senderWalletId: wallet._id }, { receiverWalletId: wallet._id }] } : {}) };
    const record = await populated(Transaction.findOne(query));
    if (!record) throw new AppError(404, 'NOT_FOUND', 'Transaction not found.');
    return transactionDto(record, wallet?._id);
  }
  async function summary(userId) {
    const wallet = await walletFor(userId);
    const grouped = await Transaction.aggregate([
      { $match: { status: 'COMPLETED', $or: [{ senderWalletId: wallet._id }, { receiverWalletId: wallet._id }] } },
      { $group: {
        _id: { direction: { $cond: [{ $eq: ['$receiverWalletId', wallet._id] }, 'received', 'sent'] }, month: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Colombo' } } },
        amount: { $sum: { $toDecimal: '$amountCents' } }, count: { $sum: 1 },
      } },
    ]);
    const totals = { sent: 0n, received: 0n }, activity = new Map();
    let count = 0;
    for (const group of grouped) {
      const cents = BigInt(group.amount.toString());
      totals[group._id.direction] += cents; count += group.count;
      const row = activity.get(group._id.month) || { month: group._id.month, sentCents: '0', receivedCents: '0' };
      row[`${group._id.direction}Cents`] = String(cents); activity.set(row.month, row);
    }
    return {
      wallet: walletDto(wallet), totalSentCents: String(totals.sent), totalReceivedCents: String(totals.received), completedCount: count,
      activity: [...activity.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-6),
      recentTransactions: (await listTransactions(userId, { page: 1, limit: 5, sort: 'newest' })).items,
      demoFundingRemainingCents: Math.max(0, 1000000 - wallet.demoFundingUsedCents),
    };
  }
  async function notifications(userId, options) {
    const query = { userId };
    const [items, total, unreadCount] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1, _id: -1 }).skip((options.page - 1) * options.limit).limit(options.limit),
      Notification.countDocuments(query), Notification.countDocuments({ userId, isRead: false }),
    ]);
    return { items: items.map(notificationDto), total, unreadCount, page: options.page, pages: Math.max(1, Math.ceil(total / options.limit)) };
  }
  async function adminDashboard() {
    const [totalUsers, totalWallets, totalTransfers, amount, recent, activity] = await Promise.all([
      User.countDocuments(), Wallet.countDocuments(), Transaction.countDocuments({ type: 'TRANSFER', status: 'COMPLETED' }),
      Transaction.aggregate([{ $match: { type: 'TRANSFER', status: 'COMPLETED' } }, { $group: { _id: null, total: { $sum: { $toDecimal: '$amountCents' } } } }]),
      listTransactions(null, { page: 1, limit: 5, sort: 'newest' }, true),
      Transaction.aggregate([
        { $match: { type: 'TRANSFER', status: 'COMPLETED' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Colombo' } }, amount: { $sum: { $toDecimal: '$amountCents' } } } },
        { $sort: { _id: -1 } }, { $limit: 6 },
      ]),
    ]);
    return { totalUsers, totalWallets, totalTransfers, transferredCents: amount[0]?.total.toString() || '0', recentTransactions: recent.items,
      activity: activity.reverse().map((row) => ({ month: row._id, sentCents: row.amount.toString(), receivedCents: row.amount.toString() })),
    };
  }
  return { walletFor, summary, transaction, transactionDto, listTransactions, notifications, adminDashboard, notificationDto, userDto, walletDto };
}
module.exports = { createQueries, notificationDto };
