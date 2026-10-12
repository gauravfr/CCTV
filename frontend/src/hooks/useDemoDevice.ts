import { useCallback, useEffect, useState } from 'react';
import { deviceApi } from '../services/deviceApi';
import type { DemoDevice } from '../types/models';
export function useDemoDevice(enabled: boolean) {
  const [device, setDevice] = useState<DemoDevice | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const refresh = useCallback(async () => { if (!enabled) return; setLoading(true); try { setDevice((await deviceApi.list())[0] || null); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load demo device'); } finally { setLoading(false); } }, [enabled]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { device, loading, error, refresh, setDevice };
}
