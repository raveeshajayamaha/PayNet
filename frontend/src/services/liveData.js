export function parseCents(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) throw new Error('Use a positive amount with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents <= 0n || cents > 10000000000n) throw new Error('Amount must be between LKR 0.01 and LKR 100,000,000.00.');
  return Number(cents);
}
// Conversion to rupees is for charts/display only. Requests and comparisons use cents.
export const displayRupees = (cents = 0) => Number(cents) / 100;
export function moneyCents(value = 0) {
  const cents = BigInt(value);
  return 'LKR ' + (cents / 100n).toLocaleString('en-LK') + '.' + String(cents % 100n).padStart(2, '0');
}
export function mapUser(user, wallet) {
  return { ...user, name: user.fullName, wallet: wallet.id, balanceCents: wallet.balanceCents, balance: displayRupees(wallet.balanceCents), real: true };
}
export function mapTransaction(t) {
  const other = t.direction === 'incoming' ? t.sender : t.receiver;
  return {
    id: t.referenceNumber, databaseId: t.id, name: other?.fullName || (t.type === 'DEMO_FUNDING' ? 'Demo funding' : 'Unavailable recipient'),
    email: other?.email || t.recipientEmail || '', type: t.direction || 'outgoing', amount: displayRupees(t.amountCents), amountCents: t.amountCents,
    status: t.status.toLowerCase(), date: t.createdAt.slice(0, 10), description: t.description || (t.type === 'DEMO_FUNDING' ? 'Controlled virtual funding' : 'Virtual payment'), real: true,
  };
}
export const mapNotification = (n) => ({ ...n, real: true, read: n.isRead, type: n.type === 'PAYMENT_RECEIVED' ? 'incoming' : 'outgoing', date: new Date(n.createdAt).toLocaleString() });
