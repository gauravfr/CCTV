import type { ApiErrorShape } from '../types/models';
let authLostHandler: (() => void) | null = null;
export function setAuthLostHandler(handler: (() => void) | null) { authLostHandler = handler; }
const configured = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE_URL || '';
export const API_BASE_URL = configured.replace(/\/$/, '');
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (response.status === 401 && !path.startsWith('/api/auth/')) authLostHandler?.();
  if (!response.ok) {
    let data: ApiErrorShape = {};
    try { data = await response.json() as ApiErrorShape; } catch { /* use status fallback */ }
    let message = data.error || data.message || `Request failed (${response.status})`;
    const retryAfter = response.headers.get('retry-after');
    if (response.status === 429 && retryAfter) {
      const seconds = Number.parseInt(retryAfter, 10);
      if (Number.isFinite(seconds)) message = `${message} Try again in ${Math.max(1, Math.ceil(seconds / 60))} minute${seconds > 60 ? 's' : ''}.`;
    }
    throw Object.assign(new Error(message), { status: response.status, code: data.code, field: data.field, retryAfter });
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

