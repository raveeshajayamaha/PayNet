// All persisted monetary values are integer LKR cents (100 cents = LKR 1).
const MAX_CENTS = Number.MAX_SAFE_INTEGER;

// Reject implicit Mongoose coercion, including rounded decimal strings/booleans.
// Negative integer deltas remain castable for future guarded $inc operations;
// document validators enforce nonnegative balances and positive amounts.
function castCents(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError('Money must be safe integer cents.');
  }
  return value;
}

function assertCents(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Money must be nonnegative safe integer cents.');
  }
  return value;
}

// Accept decimal text at a future API boundary; never use parseFloat(value) * 100.
function parseLkrToCents(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) {
    throw new TypeError('LKR must be decimal text with at most two fractional digits.');
  }
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(MAX_CENTS)) throw new RangeError('Amount exceeds safe integer cents.');
  return Number(cents);
}

function formatLkrCents(value) {
  const cents = BigInt(assertCents(value));
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

module.exports = { MAX_CENTS, castCents, assertCents, parseLkrToCents, formatLkrCents };
