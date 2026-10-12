import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../../services/authApi';
import { setAuthLostHandler } from '../../services/apiClient';
import type { SessionState } from '../../services/authApi';
type AuthContextValue = { session: SessionState | null; loading: boolean; error: string; login: (username: string, password: string) => Promise<void>; logout: () => Promise<void>; refresh: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const refresh = async () => { try { const value = await authApi.session(); setSession(value); } catch { setSession({ authenticated: false, username: null }); } finally { setLoading(false); } };
  useEffect(() => { setAuthLostHandler(() => setSession({ authenticated: false, username: null })); void refresh(); return () => setAuthLostHandler(null); }, []);
  const value = useMemo<AuthContextValue>(() => ({ session, loading, error,
    login: async (username, password) => { setError(''); try { setSession(await authApi.login(username, password)); } catch (e) { const message = e instanceof Error ? e.message : 'Sign in failed'; setError(message); throw e; } },
    logout: async () => { await authApi.logout(); setSession({ authenticated: false, username: null }); }, refresh,
  }), [session, loading, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used within AuthProvider'); return value; }

