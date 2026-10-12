export function stateLabel(state: string) { return ({ online: 'Online', connecting: 'Connecting', reconnecting: 'Reconnecting', offline: 'Offline', authentication_failed: 'Authentication failed', unsupported_codec: 'Unsupported codec', stream_error: 'Stream error' } as Record<string, string>)[state] || 'Offline'; }
export function cameraStateMessage(camera: { state: string; online: boolean }) {
  if (camera.state === 'unsupported_codec') return 'H.265 video cannot play in this browser stream. Select H.264 or enable server transcoding.';
  if (camera.state === 'authentication_failed') return 'The camera rejected the credentials.';
  if (camera.state === 'reconnecting') return 'Video interrupted. Reconnecting…';
  if (camera.state === 'connecting') return 'Waiting for verified video frames…';
  return camera.online ? '' : 'The camera or network is unavailable.';
}
export function display(value: unknown) { return value === null || value === undefined || value === '' ? 'Not available' : String(value); }
export function brandName(brand: string) { return brand === 'cpplus' ? 'CP Plus' : brand === 'dahua' ? 'Dahua' : brand === 'custom' ? 'Custom RTSP' : brand; }
