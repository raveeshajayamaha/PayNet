import { apiRequest, queryString } from './api';
export const adminService = {
  overview: () => apiRequest('/api/admin/dashboard'),
  users: (options) => apiRequest(`/api/admin/users?${queryString(options)}`),
  transactions: (options) => apiRequest(`/api/admin/transactions?${queryString(options)}`),
  health: () => apiRequest('/api/admin/system-health'),
};
