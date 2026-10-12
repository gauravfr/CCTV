"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getExecutable } = require("./executableService");

const root = path.join(__dirname, "..", "..", "data", "streams");

fs.mkdirSync(root, { recursive: true });

const runtimes = new Map();

const baseDelay = Number.parseInt(process.env.STREAM_RECONNECT_BASE_MS, 10) || 3000;

const maxDelay = Number.parseInt(process.env.STREAM_RECONNECT_MAX_MS, 10) || 30000;

const hlsSeconds = Math.max(1, Number.parseInt(process.env.STREAM_HLS_SECONDS, 10) || 1);

const listSize = Math.max(3, Number.parseInt(process.env.STREAM_HLS_LIST_SIZE, 10) || 4);

const transcodeH265 = String(process.env.STREAM_TRANSCODE_H265).toLowerCase() === "true";

function directory(id) {
  return path.join(root, id);
}

function playlist(id) {
  return path.join(directory(id), "live.m3u8");
}

function clean(id) {
  fs.mkdirSync(directory(id), { recursive: true });

  for (const file of fs.readdirSync(directory(id))) {
    if (/^(live\.m3u8|seg_\d+\.ts)$/.test(file)) {
      try {
        fs.unlinkSync(path.join(directory(id), file));
      } catch {}
    }
  }
}

function playlistFresh(id) {
  try {
    return Date.now() - fs.statSync(playlist(id)).mtimeMs < Math.max(8000, hlsSeconds * 7000);
  } catch {
    return false;
  }
}

function ensureRuntime(camera, url, metadata, onReconnect) {
  const existing = runtimes.get(camera.id);

  if (existing) {
    existing.camera = camera;
    existing.url = url;
    existing.metadata = metadata;
    existing.onReconnect = onReconnect;

    return existing;
  }

  const runtime = {
    camera,
    url,
    metadata,
    state: "connecting",
    online: false,
    rtsp: true,
    onvif: Boolean(metadata.onvif),
    lastConnected: null,
    lastSeen: null,
    lastFrame: null,
    reconnectAttempts: 0,
    process: null,
    retryTimer: null,
    stopped: false,
    onReconnect,
  };

  runtimes.set(camera.id, runtime);

  return runtime;
}

function start(camera, url, metadata = {}, onReconnect) {
  const runtime = ensureRuntime(camera, url, metadata, onReconnect);

  runtime.stopped = false;

  if (runtime.process) return runtime;

  if (/HEVC|H265/i.test(metadata.codec || "") && !transcodeH265) {
    runtime.state = "unsupported_codec";
    runtime.online = false;
    runtime.message = "Camera is using H.265/H.265+. Browser playback requires H.264 or server-side transcoding.";

    return runtime;
  }

  clean(camera.id);

  runtime.state = runtime.reconnectAttempts ? "reconnecting" : "connecting";

  runtime.message = null;

  const transcode = /HEVC|H265/i.test(metadata.codec || "") && transcodeH265;

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-rtsp_transport",
    "tcp",
    "-i",
    url,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    ...(transcode ? ["-c:v", "libx264", "-preset", process.env.STREAM_VIDEO_PRESET || "veryfast", "-tune", "zerolatency"] : ["-c:v", "copy"]),
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-b:a",
    "96k",
    "-f",
    "hls",
    "-hls_time",
    String(hlsSeconds),
    "-hls_list_size",
    String(listSize),
    "-hls_flags",
    "delete_segments+append_list+omit_endlist+independent_segments",
    "-hls_segment_filename",
    path.join(directory(camera.id), "seg_%06d.ts"),
    playlist(camera.id),
  ];

  const child = spawn(getExecutable("ffmpeg"), args, {
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  });

  runtime.process = child;

  let stderr = "";

  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });

  child.on("error", (error) => {
    runtime.message = error.code === "ENOENT" ? "FFmpeg is not installed or is not on PATH" : "Streaming service failed to start";
  });

  child.on("close", () => {
    if (runtime.process !== child) return;

    runtime.process = null;
    runtime.online = false;

    if (runtime.stopped) return;

    runtime.state = /401|unauthorized|authentication/i.test(stderr) ? "authentication_failed" : "reconnecting";

    runtime.message = runtime.state === "authentication_failed" ? "Incorrect username or password" : "Stream interrupted; reconnecting";

    schedule(runtime);
  });

  return runtime;
}

function schedule(runtime) {
  if (runtime.stopped || runtime.retryTimer) return;

  runtime.reconnectAttempts += 1;

  const delay = Math.min(maxDelay, baseDelay * 2 ** Math.min(runtime.reconnectAttempts - 1, 4));

  runtime.retryTimer = setTimeout(async () => {
    runtime.retryTimer = null;

    if (runtime.stopped) return;

    try {
      await runtime.onReconnect?.(runtime.camera.id);
    } catch {
      start(runtime.camera, runtime.url, runtime.metadata, runtime.onReconnect);
    }
  }, delay);
}

function stop(id) {
  const runtime = runtimes.get(id);

  if (!runtime) return;

  runtime.stopped = true;

  if (runtime.retryTimer) clearTimeout(runtime.retryTimer);

  if (runtime.process) runtime.process.kill();

  runtime.process = null;
  runtime.online = false;
  runtime.state = "offline";
}

function remove(id) {
  stop(id);
  runtimes.delete(id);
}

function reconnect(id) {
  const runtime = runtimes.get(id);

  if (!runtime) return false;

  const { camera, url, metadata, onReconnect } = runtime;

  stop(id);

  runtime.stopped = false;
  runtime.reconnectAttempts += 1;

  setTimeout(() => start(camera, url, metadata, onReconnect), 250);

  return true;
}

function status(id) {
  return (
    runtimes.get(id) || {
      state: "offline",
      online: false,
      rtsp: false,
      onvif: false,
      reconnectAttempts: 0,
    }
  );
}

setInterval(() => {
  for (const runtime of runtimes.values()) {
    if (playlistFresh(runtime.camera.id)) {
      const now = new Date().toISOString();

      if (!runtime.online) runtime.lastConnected = now;

      runtime.online = true;
      runtime.state = "online";
      runtime.lastSeen = now;
      runtime.lastFrame = now;
      runtime.message = null;
    } else if (runtime.process && runtime.online) {
      runtime.online = false;
      runtime.state = "reconnecting";
      runtime.message = "No recent video frames; reconnecting";
    }
  }
}, 1000).unref();

module.exports = {
  start,
  stop,
  remove,
  reconnect,
  status,
  directory,
  playlist,
};
