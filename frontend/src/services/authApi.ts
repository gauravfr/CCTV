import { api } from './apiClient';
export type SessionState = { authenticated: boolean; username: string | null };
export const authApi = {
  session: () => api<SessionState>('/api/auth/session'),
  login: (username: string, password: string) => api<SessionState>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => api<void>('/api/auth/logout', { method: 'POST', body: '{}' }),
};
