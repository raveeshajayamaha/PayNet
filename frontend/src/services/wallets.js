import { apiRequest, jsonRequest } from './api';
export const walletService = {
  get: () => apiRequest('/api/wallet'), summary: () => apiRequest('/api/wallet/summary'),
  updateProfile: (fullName) => jsonRequest('/api/users/profile', 'PATCH', { fullName }),
  fund: (amountCents, key) => jsonRequest('/api/wallet/demo-fund', 'POST', { amountCents }, { 'Idempotency-Key': key }),
};
