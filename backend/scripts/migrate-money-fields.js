const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { database, readDatabaseConfig } = require('../config/database');

async function migrateLegacyMoney(connection) {
  const wallets = connection.db.collection('wallets'), transactions = connection.db.collection('transactions');
  const priorWallets = await wallets.find({ balance: { $exists: true } }).toArray();
  const priorTransactions = await transactions.find({ $or: [{ amount: { $exists: true } }, { status: { $in: ['pending', 'completed', 'failed'] } }] }).toArray();
  // Validate every legacy record before making any change. Values already mean cents.
  for (const w of priorWallets) {
    if (!Number.isSafeInteger(w.balance) || w.balance < 0 || (w.balanceCents != null && w.balanceCents !== w.balance)) throw new Error('Unsafe or conflicting legacy balance.');
  }
  for (const t of priorTransactions) {
    const amount = t.amount ?? t.amountCents;
    if (!Number.isSafeInteger(amount) || amount <= 0 || (t.amount != null && t.amountCents != null && t.amount !== t.amountCents) || !['PENDING', 'COMPLETED', 'FAILED'].includes(t.status?.toUpperCase())) throw new Error('Unsafe or conflicting legacy transaction.');
  }
  await connection.transaction(async (session) => {
    for (const w of priorWallets) {
      const result = await wallets.updateOne({ _id: w._id, balance: w.balance, $or: [{ balanceCents: { $exists: false } }, { balanceCents: w.balance }] }, { $set: { balanceCents: w.balance, demoFundingUsedCents: w.demoFundingUsedCents || 0 }, $unset: { balance: '' } }, { session });
      if (result.matchedCount !== 1) throw new Error('Legacy wallet changed during migration.');
    }
    for (const t of priorTransactions) await transactions.updateOne({ _id: t._id }, {
      $set: { amountCents: t.amount ?? t.amountCents, status: t.status.toUpperCase(), currency: t.currency || 'LKR', type: t.type || 'TRANSFER', ...(t.status.toUpperCase() === 'COMPLETED' ? { completedAt: t.completedAt || t.updatedAt || t.createdAt } : {}) },
      $unset: { amount: '' },
    }, { session });
    await connection.db.collection('users').updateMany({ isActive: { $exists: false } }, { $set: { isActive: true, authVersion: 0 } }, { session });
    await connection.db.collection('users').updateMany({ authVersion: { $exists: false } }, { $set: { authVersion: 0 } }, { session });
    await wallets.updateMany({ demoFundingUsedCents: { $exists: false } }, { $set: { demoFundingUsedCents: 0 } }, { session });
  }, { readPreference: 'primary', writeConcern: { w: 'majority' } });
  return { wallets: priorWallets.length, transactions: priorTransactions.length };
}
if (require.main === module) {
  (async () => {
    try {
      const { uri, options } = readDatabaseConfig();
      await database.connection.openUri(uri, options);
      console.log(JSON.stringify(await migrateLegacyMoney(database.connection)));
    } catch { console.error('Migration failed. Check replica-set support and conflicting/unsafe legacy records. No records are discarded.'); process.exitCode = 1; }
    finally { await database.disconnect(); }
  })().catch(() => { process.exitCode = 1; });
}
module.exports = { migrateLegacyMoney };
