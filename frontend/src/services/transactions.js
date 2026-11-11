import { unavailable, demoMode, apiRequest, jsonRequest, queryString } from './api';
export const transactionService = {
  list: (options) => apiRequest(`/api/transactions?${queryString(options)}`),
  get: (id) => apiRequest(`/api/transactions/${id}`),
  send: demoMode ? unavailable : (input, key) => jsonRequest('/api/transfers/send', 'POST', input, { 'Idempotency-Key': key }),
};
