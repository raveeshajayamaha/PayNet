import { apiRequest, jsonRequest, queryString } from './api';
export const notificationService = {
  list: (options) => apiRequest(`/api/notifications?${queryString(options)}`),
  markRead: (id) => jsonRequest(`/api/notifications/${id}/read`, 'PATCH'),
  markAll: () => jsonRequest('/api/notifications/read-all', 'PATCH'),
};
