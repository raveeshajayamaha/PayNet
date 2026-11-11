// Only an unconfirmed request is stored, scoped to this tab and account. Never JWTs.
const keyFor = (kind, userId) => 'paynet:pending:' + kind + ':' + userId;
export function readPending(kind, userId) {
  try {
    const value = JSON.parse(sessionStorage.getItem(keyFor(kind, userId)));
    return value && typeof value.key === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value.key) && value.input && Number.isSafeInteger(value.input.amountCents) ? value : null;
  } catch { return null; }
}
export function savePending(kind, userId, value) {
  // If persistence is unavailable, keep the in-memory key and warn via the caller.
  sessionStorage.setItem(keyFor(kind, userId), JSON.stringify(value));
}
export function clearPending(kind, userId) {
  try { sessionStorage.removeItem(keyFor(kind, userId)); } catch { /* In-memory outcome is already confirmed. */ }
}

// HTTP status alone cannot establish the outcome of an earlier ambiguous request.
const failedCodes = new Set(['INSUFFICIENT_FUNDS', 'SELF_TRANSFER', 'RECIPIENT_UNAVAILABLE', 'WALLET_LIMIT', 'DEMO_FUNDING_LIMIT']);
export function isConfirmedPaymentFailure(error) {
  return failedCodes.has(error?.code) && error?.details?.status === 'FAILED' &&
    typeof error.details.referenceNumber === 'string' && /^PN-[a-zA-Z0-9-]+$/.test(error.details.referenceNumber);
}
export function isConfirmedPaymentResponse(response) {
  return response?.success === true && response.transaction?.status === 'COMPLETED' &&
    typeof response.transaction.id === 'string' && /^[a-f0-9]{24}$/i.test(response.transaction.id) &&
    typeof response.transaction.referenceNumber === 'string' && /^PN-[a-zA-Z0-9-]+$/.test(response.transaction.referenceNumber);
}
export async function executePendingPayment(kind, userId, attempt, send) {
  // Fail closed if persistence fails: do not send a request whose key cannot survive reload.
  savePending(kind, userId, attempt);
  try {
    const response = await send(attempt.input, attempt.key);
    if (!isConfirmedPaymentResponse(response)) throw Object.assign(new Error('The payment outcome is not confirmed.'), { code: 'PAYMENT_OUTCOME_UNKNOWN' });
    clearPending(kind, userId);
    return response;
  } catch (error) {
    if (isConfirmedPaymentFailure(error)) clearPending(kind, userId);
    throw error;
  }
}
