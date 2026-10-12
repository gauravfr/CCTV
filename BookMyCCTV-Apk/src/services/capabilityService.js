'use strict';

function mergeDetection(onvif, rtsp) {
  const device = onvif.device || {};
  const stream = { ...(onvif.stream || {}), ...(rtsp.metadata || {}) };
  const capabilities = {
    liveStream: Boolean(rtsp.success),
    audio: stream.audioAvailable === true,
    onvif: Boolean(onvif.working),
    ptz: onvif.capabilities?.ptz === true,
    motion: onvif.capabilities?.events === true
  };
  return {
    manufacturer: device.manufacturer || null,
    model: device.model || null,
    firmware: device.firmware || null,
    serialNumber: device.serialNumber || null,
    hardwareId: device.hardwareId || null,
    macAddress: device.macAddress || null,
    profiles: onvif.profiles?.length ? onvif.profiles : null,
    codec: stream.codec || null,
    resolution: stream.resolution || null,
    fps: stream.fps ?? null,
    bitrate: stream.bitrate ?? null,
    audioAvailable: stream.audioAvailable ?? null,
    audioCodec: stream.audioCodec || null,
    capabilities,
    // These fields remain null unless a future manufacturer integration retrieves them.
    recordingStatus: null, storageStatus: null, sdCardStatus: null, nvrStorage: null,
    nightVision: null, irLeds: null, analytics: null, uptime: null, temperature: null,
    battery: null, powerStatus: null, motionEnabled: null, latestEvent: null, lastMotion: null
  };
}

module.exports = { mergeDetection };
