'use strict';

const { Cam } = require('onvif');

function call(cam, method, args) {
  return new Promise((resolve, reject) => {
    const done = (error, result) => error ? reject(error) : resolve(result);
    if (args === undefined) cam[method](done); else cam[method](args, done);
  });
}

function connect(camera, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('ONVIF timeout')); }
    }, timeoutMs);
    const cam = new Cam({ hostname: camera.host, port: camera.onvifPort, username: camera.username,
      password: camera.password, timeout: timeoutMs }, function onReady(error) {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve(cam);
    });
  });
}

async function discover(camera, timeoutMs) {
  try {
    const cam = await connect(camera, timeoutMs);
    const [infoResult, profilesResult, capabilitiesResult, interfacesResult] = await Promise.allSettled([
      call(cam, 'getDeviceInformation'), call(cam, 'getProfiles'), call(cam, 'getCapabilities'),
      call(cam, 'getNetworkInterfaces')
    ]);
    const info = infoResult.status === 'fulfilled' ? infoResult.value : {};
    const profiles = profilesResult.status === 'fulfilled' && Array.isArray(profilesResult.value)
      ? profilesResult.value : [];
    const wantedIndex = camera.stream === 'sub' ? 1 : 0;
    const profile = profiles[wantedIndex] || profiles[0] || null;
    let streamUri = null;
    if (profile?.token) {
      try {
        const result = await call(cam, 'getStreamUri', { protocol: 'RTSP', profileToken: profile.token });
        streamUri = result?.uri || null;
      } catch { /* Some devices advertise ONVIF but deny stream URI requests. */ }
    }
    const encoder = profile?.videoEncoderConfiguration || {};
    const capabilities = capabilitiesResult.status === 'fulfilled' ? capabilitiesResult.value || {} : {};
    const networkInterfaces = interfacesResult.status === 'fulfilled' && Array.isArray(interfacesResult.value)
      ? interfacesResult.value : [];
    const macAddress = networkInterfaces.find((item) => item?.enabled && item?.info?.hwAddress)?.info?.hwAddress
      || networkInterfaces.find((item) => item?.info?.hwAddress)?.info?.hwAddress || null;
    return {
      working: true,
      client: cam,
      streamUri,
      device: {
        manufacturer: info.manufacturer || null, model: info.model || null,
        firmware: info.firmwareVersion || null, serialNumber: info.serialNumber || null,
        hardwareId: info.hardwareId || null,
        macAddress
      },
      stream: {
        codec: encoder.encoding || null,
        resolution: encoder.resolution?.width && encoder.resolution?.height ? `${encoder.resolution.width}x${encoder.resolution.height}` : null,
        fps: encoder.rateControl?.frameRateLimit ?? null,
        bitrate: encoder.rateControl?.bitrateLimit ?? null
      },
      profiles: profiles.map((item) => ({ token: item.token, name: item.name || null })),
      capabilities: {
        onvif: true,
        ptz: Boolean(capabilities.PTZ || capabilities.ptz || cam.services?.ptz),
        events: Boolean(capabilities.Events || capabilities.events || cam.services?.events)
      }
    };
  } catch {
    return { working: false, streamUri: null, device: {}, stream: {}, profiles: [], capabilities: { onvif: false } };
  }
}

async function ptz(camera, command) {
  const cam = await connect(camera, 8000);
  const direction = String(command.direction || 'stop');
  if (direction === 'stop') { await call(cam, 'stop', { panTilt: true, zoom: true }); return; }
  const vectors = {
    up: { x: 0, y: .5, zoom: 0 }, down: { x: 0, y: -.5, zoom: 0 },
    left: { x: -.5, y: 0, zoom: 0 }, right: { x: .5, y: 0, zoom: 0 },
    zoomIn: { x: 0, y: 0, zoom: .5 }, zoomOut: { x: 0, y: 0, zoom: -.5 }
  };
  const vector = vectors[direction];
  if (!vector) throw new Error('Unsupported PTZ command');
  await call(cam, 'continuousMove', vector);
}

module.exports = { discover, ptz };
