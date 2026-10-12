import { api } from './apiClient';
import type { DemoDevice } from '../types/models';
export const deviceApi = {
  list: () => api<DemoDevice[]>('/api/devices'),
  get: (id: string) => api<DemoDevice>(`/api/devices/${encodeURIComponent(id)}`),
  reconnect: (id: string) => api<{ ok: boolean; simulated?: boolean }>(`/api/devices/${encodeURIComponent(id)}/reconnect`, { method: 'POST', body: '{}' }),
};
