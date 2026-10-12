'use strict';

const express = require('express');
const crypto = require('crypto');
const { normalize, rtspCandidates, createCamera, publicCamera } = require('../services/cameraService');
const { discover, ptz } = require('../services/onvifService');
const { findWorking, snapshot } = require('../services/rtspService');
const { mergeDetection } = require('../services/capabilityService');
const streams = require('../services/streamService');
const database = require('../db/database');

const router = express.Router();
const cameras = new Map();
const pendingTests = new Map();
const TEST_TIMEOUT = Math.max(5000, Number.parseInt(process.env.CAMERA_TEST_TIMEOUT_MS, 10) || 12000);

function safeRuntime(id) {
  const runtime = streams.status(id);
  return {
    online: runtime.online, state: runtime.state, rtsp: runtime.rtsp, onvif: runtime.onvif,
    lastConnected: runtime.lastConnected, lastSeen: runtime.lastSeen, lastFrame: runtime.lastFrame,
    reconnectAttempts: runtime.reconnectAttempts, metadata: runtime.metadata || {}, message: runtime.message || null
  };
}
function getCamera(id) {
  const camera = cameras.get(id);
  if (!camera) { const error = new Error('Camera not found'); error.status = 404; throw error; }
  return camera;
}
async function testCamera(config) {
  const onvif = await discover(config, Math.min(TEST_TIMEOUT, 8000));
  const rtsp = await findWorking(rtspCandidates(config, onvif.streamUri), TEST_TIMEOUT);
  const metadata = mergeDetection(onvif, rtsp);
  const unsupportedCodec = rtsp.success && /HEVC|H265/i.test(metadata.codec || '')
    && String(process.env.STREAM_TRANSCODE_H265).toLowerCase() !== 'true';
  const success = Boolean(rtsp.success && !unsupportedCodec);
  return {
    success, cameraReachable: Boolean(rtsp.success || onvif.working),
    rtspWorking: Boolean(rtsp.success), onvifWorking: Boolean(onvif.working),
    message: unsupportedCodec
      ? 'Camera is using H.265/H.265+. Select an H.264 stream or enable server-side transcoding.'
      : rtsp.success ? 'Camera connection verified with live video frames' : rtsp.message,
    code: unsupportedCodec ? 'unsupported_codec' : rtsp.success ? null : rtsp.code,
    manufacturer: metadata.manufacturer, model: metadata.model, firmware: metadata.firmware,
    codec: metadata.codec, resolution: metadata.resolution, fps: metadata.fps,
    audioAvailable: metadata.audioAvailable, profiles: metadata.profiles,
    capabilities: metadata.capabilities, metadata, rtspUrl: rtsp.url || null
  };
}
async function activate(camera, knownResult) {
  const result = knownResult?.success ? knownResult : await testCamera(camera);
  if (!result.success) throw Object.assign(new Error(result.message), { status: 422, code: result.code });
  streams.start(camera, result.rtspUrl, { ...result.metadata, onvif: result.onvifWorking }, reconnectCamera);
  return result;
}
async function reconnectCamera(id) {
  const camera = getCamera(id);
  const result = await testCamera(camera);
  if (!result.success) throw new Error(result.message);
  streams.start(camera, result.rtspUrl, { ...result.metadata, onvif: result.onvifWorking }, reconnectCamera);
}

router.post('/test', async (req, res, next) => {
  try {
    const config = normalize(req.body);
    const result = await testCamera(config);
    if (!result.success) return res.status(422).json({ success: false, cameraReachable: result.cameraReachable,
      rtspWorking: result.rtspWorking, onvifWorking: result.onvifWorking, code: result.code, message: result.message });
    const testToken = crypto.randomUUID();
    pendingTests.set(testToken, { config, result, expires: Date.now() + 5 * 60_000 });
    res.json({ success: true, testToken, cameraReachable: true, rtspWorking: true,
      onvifWorking: result.onvifWorking, manufacturer: result.manufacturer, model: result.model,
      firmware: result.firmware, serialNumber: result.metadata.serialNumber,
      hardwareId: result.metadata.hardwareId, macAddress: result.metadata.macAddress,
      codec: result.codec, resolution: result.resolution, fps: result.fps,
      audioAvailable: result.audioAvailable, profiles: result.profiles, capabilities: result.capabilities,
      message: result.message });
  } catch (error) { next(error); }
});

router.post('/connect', async (req, res, next) => {
  try {
    const pending = pendingTests.get(String(req.body?.testToken || ''));
    if (!pending || pending.expires < Date.now()) return res.status(400).json({ error: 'Test the camera again before connecting' });
    pendingTests.delete(req.body.testToken);
    const camera = createCamera({ ...pending.config, remember: Boolean(req.body.remember) });
    cameras.set(camera.id, camera);
    await activate(camera, pending.result);
    if (camera.remember) database.saveCamera(camera, pending.result.metadata);
    res.status(201).json(publicCamera(camera, safeRuntime(camera.id)));
  } catch (error) { next(error); }
});

router.get('/', (_req, res) => res.json([...cameras.values()].map((camera) => publicCamera(camera, safeRuntime(camera.id)))));
router.get('/:id', (req, res, next) => {
  try { const camera = getCamera(req.params.id); res.json(publicCamera(camera, safeRuntime(camera.id))); }
  catch (error) { next(error); }
});
router.patch('/:id', async (req, res, next) => {
  try {
    const camera = getCamera(req.params.id);
    const merged = normalize({ ...camera, ...req.body, password: req.body.password || camera.password }, { passwordOptional: true });
    const result = await testCamera(merged);
    if (!result.success) return res.status(422).json({ error: result.message, code: result.code });
    const updated = { ...camera, ...merged, id: camera.id, remembered: Boolean(req.body.remember ?? camera.remembered) };
    cameras.set(updated.id, updated);
    streams.remove(updated.id);
    await activate(updated, result);
    if (updated.remembered) database.saveCamera(updated, result.metadata); else database.deleteCamera(updated.id);
    res.json(publicCamera(updated, safeRuntime(updated.id)));
  } catch (error) { next(error); }
});
router.delete('/:id', (req, res, next) => {
  try { getCamera(req.params.id); streams.remove(req.params.id); cameras.delete(req.params.id); database.deleteCamera(req.params.id); res.sendStatus(204); }
  catch (error) { next(error); }
});
router.post('/:id/reconnect', async (req, res, next) => {
  try { getCamera(req.params.id); streams.reconnect(req.params.id) || await reconnectCamera(req.params.id); res.status(202).json({ ok: true }); }
  catch (error) { next(error); }
});
router.get('/:id/status', (req, res, next) => {
  try { const camera = getCamera(req.params.id); res.json(publicCamera(camera, safeRuntime(camera.id))); }
  catch (error) { next(error); }
});
router.get('/:id/capabilities', (req, res, next) => {
  try { getCamera(req.params.id); res.json(safeRuntime(req.params.id).metadata.capabilities || {}); }
  catch (error) { next(error); }
});
router.get('/:id/device-info', (req, res, next) => {
  try { const camera = getCamera(req.params.id); res.json(publicCamera(camera, safeRuntime(camera.id))); }
  catch (error) { next(error); }
});
router.post('/:id/snapshot', async (req, res, next) => {
  try {
    const camera = getCamera(req.params.id);
    const runtime = streams.status(camera.id);
    if (!runtime.url) return res.status(409).json({ error: 'Live stream is not available' });
    const jpeg = await snapshot(runtime.url);
    const safeName = camera.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'camera';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    res.set({ 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="${safeName}-${stamp}.jpg"`, 'Cache-Control': 'no-store' }).send(jpeg);
  } catch (error) { next(error); }
});
router.post('/:id/ptz', async (req, res, next) => {
  try {
    const camera = getCamera(req.params.id);
    if (streams.status(camera.id).metadata?.capabilities?.ptz !== true) return res.status(409).json({ error: 'PTZ is not available for this camera' });
    await ptz(camera, req.body || {});
    res.json({ ok: true });
  } catch (error) { next(error); }
});

function restoreSaved() {
  let saved = [];
  try { saved = database.listSavedCameras(); } catch (error) {
    if (process.env.CAMERA_ENCRYPTION_KEY) console.error('Remembered cameras could not be loaded.');
  }
  for (const camera of saved) {
    cameras.set(camera.id, camera);
    activate(camera).catch(() => {});
  }
}
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of pendingTests) if (entry.expires < now) pendingTests.delete(token);
}, 60_000).unref();

module.exports = { router, restoreSaved, cameras, safeRuntime };
