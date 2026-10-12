'use strict';

const { spawn } = require('child_process');
const { getExecutable } = require('./executableService');

function parseRate(value) {
  if (!value || value === '0/0') return null;
  const [a, b = 1] = String(value).split('/').map(Number);
  return Number.isFinite(a / b) && b ? Math.round((a / b) * 100) / 100 : null;
}
function friendlyFailure(stderr) {
  const text = String(stderr).toLowerCase();
  if (/401|unauthorized|authentication|method describe failed: 4/.test(text)) return { code: 'authentication_failed', message: 'Incorrect username or password' };
  if (/connection refused/.test(text)) return { code: 'wrong_port', message: 'RTSP connection was refused; check the port and RTSP setting' };
  if (/timed out|timeout/.test(text)) return { code: 'stream_timeout', message: 'Stream connection timed out' };
  if (/decoder.*not found|unsupported codec|unknown codec/.test(text)) return { code: 'unsupported_codec', message: 'The camera stream uses an unsupported codec' };
  if (/no route|network is unreachable|host is unreachable|could not resolve|name or service not known|getaddrinfo/.test(text)) return { code: 'host_unreachable', message: 'Camera host is unreachable; check the address, VPN, or tunnel' };
  if (/404|not found/.test(text)) return { code: 'invalid_stream_path', message: 'RTSP stream path or channel was not found' };
  return { code: 'camera_unreachable', message: 'Unable to connect to camera' };
}

function run(command, args, timeoutMs, maxBytes = 2_000_000) {
  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0);
    let stderr = '';
    let settled = false;
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => { child.kill(); finish({ ok: false, timeout: true, stdout, stderr }); }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length <= maxBytes) stdout = Buffer.concat([stdout, chunk]);
      else child.kill();
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-12000); });
    child.on('error', (error) => finish({ ok: false, missing: error.code === 'ENOENT', stdout, stderr }));
    child.on('close', (code) => finish({ ok: code === 0, code, stdout, stderr }));
  });
}

async function probeUrl(url, timeoutMs) {
  const result = await run(getExecutable('ffprobe'), [
    '-v', 'error', '-rtsp_transport', 'tcp', '-rw_timeout', String(timeoutMs * 1000),
    '-read_intervals', '%+4', '-show_streams', '-show_frames',
    '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,bit_rate:frame=media_type',
    '-of', 'json', url
  ], timeoutMs + 2000);
  if (result.missing) return { success: false, code: 'ffprobe_missing', message: 'FFprobe is not installed or is not on PATH' };
  if (!result.ok) return { success: false, ...friendlyFailure(result.timeout ? 'timeout' : result.stderr) };
  try {
    const data = JSON.parse(result.stdout.toString('utf8'));
    const video = data.streams?.find((stream) => stream.codec_type === 'video');
    const audio = data.streams?.find((stream) => stream.codec_type === 'audio');
    const frames = (data.frames || []).filter((frame) => frame.media_type === 'video').length;
    if (!video || frames < 1) return { success: false, code: 'no_video_frames', message: 'RTSP connected, but no video frames arrived' };
    return {
      success: true,
      framesReceived: frames,
      metadata: {
        codec: video.codec_name ? String(video.codec_name).toUpperCase() : null,
        resolution: video.width && video.height ? `${video.width}x${video.height}` : null,
        fps: parseRate(video.avg_frame_rate || video.r_frame_rate),
        bitrate: video.bit_rate ? Number(video.bit_rate) : null,
        audioAvailable: Boolean(audio),
        audioCodec: audio?.codec_name ? String(audio.codec_name).toUpperCase() : null
      }
    };
  } catch { return { success: false, code: 'invalid_probe_response', message: 'Camera returned unreadable stream information' }; }
}

async function findWorking(candidates, timeoutMs) {
  let lastFailure = { success: false, code: 'rtsp_unavailable', message: 'No RTSP stream address could be discovered' };
  for (const url of candidates) {
    const result = await probeUrl(url, timeoutMs);
    if (result.success) return { ...result, url };
    lastFailure = result;
    if (result.code === 'authentication_failed' || result.code === 'ffprobe_missing') break;
  }
  return lastFailure;
}

async function snapshot(url, timeoutMs = 12000) {
  const result = await run(getExecutable('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp',
    '-rw_timeout', String(timeoutMs * 1000), '-i', url, '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], timeoutMs, 12_000_000);
  if (!result.ok || !result.stdout.length) throw new Error(result.missing ? 'FFmpeg is not installed' : friendlyFailure(result.stderr).message);
  return result.stdout;
}

module.exports = { findWorking, snapshot, friendlyFailure };
