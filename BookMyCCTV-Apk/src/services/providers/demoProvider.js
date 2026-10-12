'use strict';

const now = () => new Date();
const device = {
  id: 'DEMO-CPPLUS-001', name: 'CP Plus Demo XVR', brand: 'CP Plus', model: 'CP-XVR-4CH-DEMO', serial: 'SIM-CPXVR-2026-001', firmware: 'Demo firmware 2.4.8', hardware: 'Demo revision A', status: 'online', connection: 'Demo / Simulation', dataSource: 'demo',
  overview: { macAddress: '02:CP:00:00:00:01', ipAddress: '192.168.10.88', gateway: '192.168.10.1', dns: '192.168.10.1', subnetMask: '255.255.255.0', uptime: '18 days, 06:42:18', currentTime: () => now().toISOString(), lastBoot: '2026-09-15T08:00:00.000Z', lastSeen: () => now().toISOString() },
  health: { temperature: { value: 42, unit: '°C' }, battery: { value: 87, unit: '%' }, power: 'AC Power / Battery Backup', cpu: { value: 31, unit: '%' }, memory: { value: 54, unit: '%' }, storage: { value: 68, unit: '%' }, network: 'Excellent', recording: 'ACTIVE', motion: 'NORMAL', dataSource: 'demo' },
  channels: [
    { id: 1, name: 'Front Entrance', status: 'online', resolution: '1920×1080', fps: 25, codec: 'H.265', bitrate: '2.4 Mbps', audio: 'Available', recording: 'Active', motion: 'Normal', signal: 'Strong', streamType: 'Main', lastFrame: 'Just now', ptz: false },
    { id: 2, name: 'Loading Bay', status: 'online', resolution: '1920×1080', fps: 25, codec: 'H.265', bitrate: '2.1 Mbps', audio: 'Available', recording: 'Active', motion: 'Normal', signal: 'Good', streamType: 'Main', lastFrame: 'Just now', ptz: true },
    { id: 3, name: 'West Perimeter', status: 'offline', resolution: 'Not available', fps: null, codec: 'Not available', bitrate: 'Not available', audio: 'Not available', recording: 'Inactive', motion: 'Not available', signal: 'No signal', streamType: 'Main', lastFrame: '13:21', ptz: false },
    { id: 4, name: 'Reception', status: 'online', resolution: '1280×720', fps: 25, codec: 'H.264', bitrate: '1.2 Mbps', audio: 'Available', recording: 'Active', motion: 'Normal', signal: 'Good', streamType: 'Main', lastFrame: 'Just now', ptz: false }
  ],
  storage: { disks: [{ name: 'HDD 1', status: 'Healthy', capacity: 2000, used: 1360, free: 640, unit: 'GB', usage: 68, temperature: 39, recording: 'Active' }], total: '2 TB', used: '1.36 TB', free: '640 GB', recording: 'Active', estimatedRecordingTime: '12 days, 8 hours', dataSource: 'demo' },
  events: [
    { type: 'Motion', severity: 'info', title: 'Motion Detected', channel: 'Channel 1', time: 'Today 14:32' }, { type: 'Recording', severity: 'info', title: 'Recording Started', channel: 'Channel 2', time: 'Today 14:30' }, { type: 'Video Loss', severity: 'warning', title: 'Video Loss', channel: 'Channel 3', time: 'Today 13:21' }, { type: 'System', severity: 'info', title: 'HDD Health Check', channel: 'System', time: 'Today 12:10' }, { type: 'Network', severity: 'info', title: 'Network Reconnected', channel: 'System', time: 'Today 11:45' }
  ],
  network: { connectionStatus: 'Connected', ipAddress: '192.168.10.88', macAddress: '02:CP:00:00:00:01', gateway: '192.168.10.1', dns: '192.168.10.1', subnetMask: '255.255.255.0', httpPort: 80, httpsPort: 443, rtspPort: 554, onvifPort: 8000, p2p: 'Enabled (simulated)', quality: 'Excellent', upload: '2.4 Mbps', download: '5.7 Mbps', packetLoss: '0.1%', latency: '12 ms', dataSource: 'demo' },
  ptz: { supportedChannels: [2], controlsSimulated: true }, capabilities: { channels: 4, storage: true, ptz: true, audio: true, alarm: true, motionDetection: true, p2p: true, onvif: true, rtsp: true }
};
function normalize() { return { ...device, overview: { ...device.overview, currentTime: device.overview.currentTime(), lastSeen: device.overview.lastSeen() }, health: { ...device.health }, channels: device.channels.map((x) => ({ ...x })), storage: { ...device.storage, disks: device.storage.disks.map((x) => ({ ...x })) }, events: device.events.map((x) => ({ ...x })), network: { ...device.network }, ptz: { ...device.ptz }, capabilities: { ...device.capabilities } }; }
module.exports = { list: () => [normalize()], get: (id) => id === device.id ? normalize() : null, getSection: (id, section) => id === device.id ? normalize()[section] ?? null : null };
