import { useCallback, useEffect, useState } from 'react';
import { cameraApi } from '../services/cameraApi';
import type { Camera } from '../types/models';
export function useCameras(enabled: boolean) {
  const [cameras, setCameras] = useState<Camera[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const refresh = useCallback(async () => { if (!enabled) return; setLoading(true); try { setCameras(await cameraApi.list()); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load cameras'); } finally { setLoading(false); } }, [enabled]);
  useEffect(() => { if (!enabled) return; void refresh(); const timer = window.setInterval(() => void refresh(), 3000); return () => window.clearInterval(timer); }, [enabled, refresh]);
  return { cameras, loading, error, refresh, setCameras };
}
