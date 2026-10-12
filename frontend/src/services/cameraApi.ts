import { api } from './apiClient';
import type { Camera, CameraInput } from '../types/models';
export const cameraApi = {
  list: () => api<Camera[]>('/api/cameras'),
  get: (id: string) => api<Camera>(`/api/cameras/${encodeURIComponent(id)}`),
  test: (input: CameraInput) => api<Record<string, unknown>>('/api/cameras/test', { method: 'POST', body: JSON.stringify(input) }),
  connect: (testToken: string, remember: boolean) => api<Camera>('/api/cameras/connect', { method: 'POST', body: JSON.stringify({ testToken, remember }) }),
  update: (id: string, input: CameraInput) => api<Camera>(`/api/cameras/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => api<void>(`/api/cameras/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reconnect: (id: string) => api<{ ok: boolean }>(`/api/cameras/${encodeURIComponent(id)}/reconnect`, { method: 'POST', body: '{}' }),
  snapshot: async (id: string) => {
    const response = await fetch(`${(import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE_URL || ''}/api/cameras/${encodeURIComponent(id)}/snapshot`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Snapshot failed'); }
    return response.blob();
  },
  ptz: (id: string, command: Record<string, unknown>) => api<{ ok: boolean }>(`/api/cameras/${encodeURIComponent(id)}/ptz`, { method: 'POST', body: JSON.stringify(command) }),
};
