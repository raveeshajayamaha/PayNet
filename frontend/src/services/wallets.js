import { apiRequest, jsonRequest } from './api';
export const walletService = {
  get: () => apiRequest('/api/wallet'), summary: (options) => apiRequest('/api/wallet/summary', options),
  updateProfile: (fullName) => jsonRequest('/api/users/profile', 'PATCH', { fullName }),
  fund: (amountCents, key) => jsonRequest('/api/wallet/demo-fund', 'POST', { amountCents }, { 'Idempotency-Key': key }),
};
