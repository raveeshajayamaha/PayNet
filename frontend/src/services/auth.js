import { unavailable, demoMode, apiRequest, jsonRequest } from "./api";
export const authService = {
  login: demoMode ? unavailable : ({ email, password, terms }) => jsonRequest('/api/auth/login', 'POST', { email, password, rememberMe: Boolean(terms) }),
  register: demoMode ? unavailable : ({ name, email, password }) => jsonRequest('/api/auth/register', 'POST', { fullName: name, email, password }),
  me: (options) => apiRequest('/api/auth/me', options),
  logout: () => jsonRequest('/api/auth/logout', 'POST'),
  changePassword: demoMode ? unavailable : ({ current, next }) => jsonRequest('/api/users/change-password', 'PATCH', { currentPassword: current, newPassword: next }),
};
