export type ApiErrorShape = { error?: string; message?: string; code?: string; field?: string };
export type Camera = {
  id: string; name: string; brand: string; connectionType: string; host: string; username?: string;
  rtspPort: number; onvifPort: number; channel: number; stream: string; remembered: boolean;
  online: boolean; state: string; rtsp: boolean; onvif: boolean; lastConnected?: string | null;
  lastSeen?: string | null; lastFrame?: string | null; reconnectAttempts: number;
  manufacturer?: string; model?: string; firmware?: string; serialNumber?: string; hardwareId?: string;
  macAddress?: string; codec?: string; resolution?: string; fps?: number; bitrate?: number;
  audioAvailable?: boolean; capabilities?: Record<string, boolean>; [key: string]: unknown;
};
export type CameraInput = { name: string; brand: string; connectionType: string; host: string; username: string; password?: string; rtspPort: number; onvifPort: number; channel: number; stream: string; customRtspUrl?: string; remember: boolean };
export type HealthMetric = { value: number | string; unit?: string };
export type DemoChannel = { id: number; name: string; status: string; resolution: string; fps: number | null; codec: string; bitrate: string; audio: string; recording: string; motion: string; signal: string; streamType: string; lastFrame: string; ptz: boolean };
export type DemoEvent = { type: string; severity: string; title: string; channel: string; time: string };
export type DemoDevice = {
  id: string; name: string; brand: string; model: string; serial: string; firmware: string; hardware: string;
  status: string; connection: string; dataSource: 'demo';
  overview: Record<string, string>;
  health: { temperature: HealthMetric; battery: HealthMetric; power: string; cpu: HealthMetric; memory: HealthMetric; storage: HealthMetric; network: string; recording: string; motion: string; dataSource: 'demo' };
  channels: DemoChannel[]; storage: { disks: Array<Record<string, string | number>>; total: string; used: string; free: string; recording: string; estimatedRecordingTime: string; dataSource: 'demo' };
  events: DemoEvent[]; network: Record<string, string | number>; ptz: { supportedChannels: number[]; controlsSimulated: boolean }; capabilities: Record<string, boolean | number>;
};
