"use strict";

const crypto = require("crypto");
const { pathFor: dahuaPath } = require("./dahuaService");
const { knownPaths: cpplusPaths } = require("./cpplusService");

const ALLOWED_BRANDS = new Set(["dahua", "cpplus", "custom"]);
const ALLOWED_CONNECTIONS = new Set(["direct", "recorder"]);
const ALLOWED_STREAMS = new Set(["main", "sub"]);

function invalid(message, field) {
  const error = new Error(message);
  error.status = 400;
  error.field = field;
  throw error;
}

function normalize(input, { passwordOptional = false } = {}) {
  const value = input && typeof input === "object" ? input : {};
  const name = String(value.name || "")
    .trim()
    .slice(0, 80);
  const brand = String(value.brand || "").toLowerCase();
  const connectionType = String(value.connectionType || "direct").toLowerCase();
  const host = String(value.host || "").trim();
  const username = String(value.username || "").trim();
  const password = String(value.password || "");
  const rtspPort = Number.parseInt(value.rtspPort, 10) || 554;
  const onvifPort = Number.parseInt(value.onvifPort, 10) || 80;
  const channel = Number.parseInt(value.channel, 10) || 1;
  const stream = String(value.stream || "main").toLowerCase();
  const customRtspUrl = String(value.customRtspUrl || "").trim();
  if (name.length < 2) invalid("Enter a camera name", "name");
  if (!ALLOWED_BRANDS.has(brand)) invalid("Select a supported brand", "brand");
  if (!ALLOWED_CONNECTIONS.has(connectionType)) invalid("Select a valid connection type", "connectionType");
  if (!host || host.length > 253 || !/^[a-zA-Z0-9._:[\]-]+$/.test(host)) invalid("Enter a valid IP address or hostname", "host");
  if (!username || username.length > 128) invalid("Enter the camera username", "username");
  if (!passwordOptional && !password) invalid("Enter the camera password", "password");
  if (password.length > 256) invalid("Password is too long", "password");
  if (rtspPort < 1 || rtspPort > 65535) invalid("RTSP port must be between 1 and 65535", "rtspPort");
  if (onvifPort < 1 || onvifPort > 65535) invalid("ONVIF port must be between 1 and 65535", "onvifPort");
  if (channel < 1 || channel > 1024) invalid("Channel must be between 1 and 1024", "channel");
  if (!ALLOWED_STREAMS.has(stream)) invalid("Select a valid stream", "stream");
  if (customRtspUrl) {
    let parsed;
    try {
      parsed = new URL(customRtspUrl);
    } catch {
      invalid("Custom RTSP URL is invalid", "customRtspUrl");
    }
    if (!["rtsp:", "rtsps:"].includes(parsed.protocol)) invalid("Custom URL must use RTSP or RTSPS", "customRtspUrl");
    parsed.username = "";
    parsed.password = "";
    if (parsed.hostname !== host.replace(/^\[|\]$/g, "")) invalid("Custom RTSP URL must use the entered host", "customRtspUrl");
  }
  return { name, brand, connectionType, host, rtspPort, onvifPort, username, password, channel, stream, customRtspUrl, remember: Boolean(value.remember) };
}

function withCredentials(rawUrl, camera) {
  const url = new URL(rawUrl);
  url.username = camera.username;
  url.password = camera.password;
  return url.toString();
}

function rtspCandidates(camera, onvifUri) {
  const candidates = [];
  if (onvifUri) candidates.push(withCredentials(onvifUri, camera));
  if (camera.customRtspUrl) candidates.push(withCredentials(camera.customRtspUrl, camera));
  const base = `rtsp://${camera.host}:${camera.rtspPort}`;
  if (camera.brand === "dahua") candidates.push(withCredentials(base + dahuaPath(camera), camera));
  if (camera.brand === "cpplus") cpplusPaths(camera).forEach((part) => candidates.push(withCredentials(base + part, camera)));
  return [...new Set(candidates)];
}

function createCamera(config) {
  return { id: `cam_${crypto.randomUUID()}`, ...config, createdAt: new Date().toISOString() };
}

function publicCamera(camera, runtime = {}) {
  return {
    id: camera.id,
    name: camera.name,
    brand: camera.brand,
    connectionType: camera.connectionType,
    host: camera.host,
    username: camera.username,
    rtspPort: camera.rtspPort,
    onvifPort: camera.onvifPort,
    channel: camera.channel,
    stream: camera.stream,
    remembered: Boolean(camera.remembered || camera.remember),
    online: Boolean(runtime.online),
    state: runtime.state || "offline",
    rtsp: Boolean(runtime.rtsp),
    onvif: Boolean(runtime.onvif),
    lastConnected: runtime.lastConnected || null,
    lastSeen: runtime.lastSeen || null,
    lastFrame: runtime.lastFrame || null,
    reconnectAttempts: runtime.reconnectAttempts || 0,
    ...(runtime.metadata || {}),
  };
}

module.exports = { normalize, rtspCandidates, createCamera, publicCamera };
