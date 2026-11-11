import { apiRequest, jsonRequest, queryString } from './api';
export const notificationService = {
  list: (options, requestOptions) => apiRequest(`/api/notifications?${queryString(options)}`, requestOptions),
  markRead: (id, options) => jsonRequest(`/api/notifications/${id}/read`, 'PATCH', {}, {}, options),
  markAll: (options) => jsonRequest('/api/notifications/read-all', 'PATCH', {}, {}, options),
};
