"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const app = $("#app");
const loginScreen = $("#loginScreen");
const grid = $("#cameraGrid");
const emptyState = $("#emptyState");
const modal = $("#cameraModal");
const form = $("#cameraForm");
const testPanel = $("#testPanel");
const drawer = $("#detailsDrawer");
const drawerBackdrop = $("#drawerBackdrop");
const players = new Map();
let cameras = [];
let cameraDataLoaded = false;
let demoDataLoaded = false;
let testToken = null;
let editingId = null;
let toastTimer = null;

const formatTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });
const compactTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const compactDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
  if (response.status === 401 && url !== "/api/auth/login") showLogin();
  if (!response.ok) {
    let data = {};
    try {
      data = await response.json();
    } catch {}
    throw Object.assign(new Error(data.error || data.message || "The request could not be completed"), { code: data.code, field: data.field, status: response.status });
  }
  return response.status === 204 ? null : response.json();
}
function showToast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2800);
}
function showLogin() {
  app.hidden = true;
  loginScreen.hidden = false;
}
function showApp() {
  loginScreen.hidden = true;
  app.hidden = false;
  loadCameras();
  loadDemoCard();
}
function label(value) {
  return value === null || value === undefined || value === "" ? "Not available" : String(value);
}
function brandName(brand) {
  return brand === "cpplus" ? "CP Plus" : brand === "dahua" ? "Dahua" : "Custom RTSP";
}
function stateLabel(state) {
  return (
    {
      online: "Online",
      connecting: "Connecting",
      reconnecting: "Reconnecting",
      offline: "Offline",
      authentication_failed: "Authentication failed",
      unsupported_codec: "Unsupported codec",
      stream_error: "Stream error",
    }[state] || "Offline"
  );
}
function stateMessage(camera) {
  if (camera.state === "unsupported_codec") return "Camera is using H.265/H.265+. Browser playback requires H.264 or server-side transcoding.";
  if (camera.state === "authentication_failed") return "The camera rejected the username or password.";
  if (camera.state === "reconnecting") return "Video was interrupted. Retrying automatically…";
  if (camera.state === "connecting") return "Waiting for verified video frames…";
  return camera.online ? "" : "The camera or remote network is unavailable.";
}
function cardMarkup(camera) {
  return `<article class="camera-card ${camera.state}" data-id="${camera.id}">
    <div class="player">
      <video playsinline muted></video>
      <div class="player-top"><div class="player-name"><strong>${escapeHtml(camera.name)}</strong><span>${escapeHtml(brandName(camera.brand))} · CH ${camera.channel}</span></div><span class="live-tag">LIVE</span></div>
      <time class="timestamp">—</time>
      <div class="player-overlay"><div class="state-block"><span class="state-mark"></span><strong>${escapeHtml(stateLabel(camera.state))}</strong><span>${escapeHtml(stateMessage(camera))}</span></div></div>
      <div class="player-controls">
        <button class="control play" type="button" title="Play or pause" aria-label="Play or pause">▶</button>
        <button class="control mute" type="button" title="Mute or unmute" aria-label="Mute or unmute">◖</button>
        <input class="volume" type="range" min="0" max="1" value="0" step="0.05" aria-label="Volume">
        <span class="control-spacer"></span>
        <button class="control snap" type="button" title="Download snapshot" aria-label="Download snapshot">▣</button>
        <button class="control refresh" type="button" title="Reconnect" aria-label="Reconnect">↻</button>
        <button class="control expand" type="button" title="Fullscreen" aria-label="Fullscreen">⛶</button>
      </div>
    </div>
    <div class="card-footer"><div class="camera-meta"><span class="status-dot"></span><span class="meta-copy"><strong>${escapeHtml(stateLabel(camera.state))}</strong><span>${escapeHtml(camera.host)} · ${escapeHtml(label(camera.resolution))}</span></span></div>
      <div class="card-actions"><button class="tiny-button details" type="button">Details</button><button class="tiny-button settings" type="button" title="Edit camera connection settings">Edit Camera</button><button class="tiny-button remove" type="button" title="Remove camera">Remove</button></div>
    </div></article>`;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
function renderAll() {
  for (const hls of players.values()) hls.destroy?.();
  players.clear();
  grid.innerHTML = cameras.map(cardMarkup).join("");
  emptyState.hidden = cameras.length > 0;
  grid.hidden = cameras.length === 0;
  bindCards();
  cameras.forEach((camera) => camera.online && attachStream(camera));
  updateSummary();
  updateHomeState();
}
function updateCard(camera) {
  const card = grid.querySelector(`[data-id="${camera.id}"]`);
  if (!card) return;
  card.className = `camera-card ${camera.state}`;
  $(".state-block strong", card).textContent = stateLabel(camera.state);
  $(".state-block span:last-child", card).textContent = stateMessage(camera);
  $(".meta-copy strong", card).textContent = stateLabel(camera.state);
  $(".meta-copy span", card).textContent = `${camera.host} · ${label(camera.resolution)}`;
  if (camera.online && !players.has(camera.id)) attachStream(camera);
  if (!camera.online && players.has(camera.id)) {
    players.get(camera.id).destroy?.();
    players.delete(camera.id);
  }
}
function updateSummary() {
  const online = cameras.filter((camera) => camera.online).length;
  $("#summary").textContent = cameras.length ? `${online} of ${cameras.length} cameras online` : demoDevice ? "All devices are reporting normally" : "No devices added yet";
}
function updateHomeState() {
  const hasDevices = cameras.length > 0 || Boolean(demoDevice);
  emptyState.hidden = hasDevices || !cameraDataLoaded || !demoDataLoaded;
  demoCard.hidden = !demoDevice || !devicePage.hidden;
  grid.hidden = cameras.length === 0 || !devicePage.hidden;
  const online = cameras.filter((camera) => camera.online).length + (demoDevice?.status === "online" ? 1 : 0);
  const channels = cameras.length + (demoDevice?.channels?.length || 0);
  const alerts = demoDevice?.events?.filter((event) => event.severity === "warning" || event.severity === "critical").length || 0;
  $("#statDevices").textContent = String(online);
  $("#statChannels").textContent = String(channels);
  $("#statRecording").textContent = demoDevice?.health?.recording || (cameras.length ? "Active" : "—");
  $("#statAlerts").textContent = String(alerts);
  $("#deviceCount").textContent = `${cameras.length + (demoDevice ? 1 : 0)} ${(cameras.length + (demoDevice ? 1 : 0)) === 1 ? "device" : "devices"}`;
  updateSummary();
}async function loadCameras() {
  try {
    const fresh = await api("/api/cameras");
    const idsChanged = fresh.map((x) => x.id).join() !== cameras.map((x) => x.id).join();
    cameras = fresh;
    cameraDataLoaded = true;
    if (idsChanged) renderAll();
    else {
      cameras.forEach(updateCard);
      updateSummary();
      updateHomeState();
    }
  } catch (error) {
    cameraDataLoaded = true;
    updateHomeState();
    if (error.status !== 401) showToast(error.message);
  }
}function attachStream(camera) {
  const video = $(`[data-id="${camera.id}"] video`);
  if (!video) return;
  const url = `/stream/${camera.id}/live.m3u8?t=${Date.now()}`;
  if (window.Hls?.isSupported()) {
    const hls = new window.Hls({
      lowLatencyMode: true,
      liveSyncDurationCount: 2,
      liveMaxLatencyDurationCount: 5,
      backBufferLength: 0,
      maxBufferLength: 8,
      manifestLoadingTimeOut: 8000,
      fragLoadingTimeOut: 10000,
    });
    players.set(camera.id, hls);
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (data.fatal && data.type !== window.Hls.ErrorTypes.MEDIA_ERROR) reconnect(camera.id, false);
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    video.play().catch(() => {});
    players.set(camera.id, {
      destroy: () => {
        video.removeAttribute("src");
        video.load();
      },
    });
  }
}
function bindCards() {
  grid.querySelectorAll(".camera-card").forEach((card) => {
    const id = card.dataset.id;
    const video = $("video", card);
    $(".play", card).addEventListener("click", () => (video.paused ? video.play().catch(() => showToast("Stream is not ready")) : video.pause()));
    $(".mute", card).addEventListener("click", () => {
      video.muted = !video.muted;
      $(".mute", card).textContent = video.muted ? "◖" : "🔊";
      if (!video.muted && video.volume === 0) video.volume = 0.6;
    });
    $(".volume", card).addEventListener("input", (event) => {
      video.volume = Number(event.target.value);
      video.muted = video.volume === 0;
      $(".mute", card).textContent = video.muted ? "◖" : "🔊";
    });
    $(".snap", card).addEventListener("click", () => downloadSnapshot(id));
    $(".refresh", card).addEventListener("click", () => reconnect(id, true));
    $(".expand", card).addEventListener("click", () => card.querySelector(".player").requestFullscreen?.());
    $(".details", card).addEventListener("click", () => openDetails(id));
    $(".settings", card).addEventListener("click", () => openEdit(id));
    $(".remove", card).addEventListener("click", () => removeCamera(id));
  });
}
async function reconnect(id, notify = true) {
  if (players.has(id)) {
    players.get(id).destroy?.();
    players.delete(id);
  }
  try {
    await api(`/api/cameras/${id}/reconnect`, { method: "POST", body: "{}" });
    if (notify) showToast("Camera reconnect started");
    setTimeout(loadCameras, 800);
  } catch (error) {
    if (notify) showToast(error.message);
  }
}
async function downloadSnapshot(id) {
  try {
    const response = await fetch(`/api/cameras/${id}/snapshot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Snapshot failed");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `camera-${Date.now()}.jpg`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast("Snapshot downloaded");
  } catch (error) {
    showToast(error.message);
  }
}
async function removeCamera(id) {
  const camera = cameras.find((item) => item.id === id);
  if (!confirm(`Remove ${camera?.name || "this camera"}?`)) return;
  try {
    await api(`/api/cameras/${id}`, { method: "DELETE" });
    showToast("Camera removed");
    await loadCameras();
  } catch (error) {
    showToast(error.message);
  }
}
function detailRow(name, value) {
  return `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(label(value))}</dd></div>`;
}
function openDetails(id) {
  const c = cameras.find((item) => item.id === id);
  if (!c) return;
  $("#drawerTitle").textContent = c.name;
  const caps = c.capabilities || {};
  $("#drawerBody").innerHTML = `
    <section class="detail-section"><h3>DEVICE INFORMATION</h3><dl class="detail-list">${detailRow("Manufacturer", c.manufacturer)}${detailRow("Model", c.model)}${detailRow("Firmware Version", c.firmware)}${detailRow("Serial Number", c.serialNumber)}${detailRow("Hardware ID / Device ID", c.hardwareId)}${detailRow("MAC Address", c.macAddress)}${detailRow("IP Address", c.host)}${detailRow("Channel", c.channel)}</dl></section>
    <section class="detail-section"><h3>STREAM</h3><dl class="detail-list">${detailRow("Codec", c.codec)}${detailRow("Resolution", c.resolution)}${detailRow("FPS", c.fps)}${detailRow("Bitrate", c.bitrate ? `${Math.round(c.bitrate / 1000)} kbps` : null)}${detailRow("Audio", c.audioAvailable === true ? c.audioCodec || "Available" : c.audioAvailable === false ? "Not detected" : null)}</dl></section>
    <section class="detail-section"><h3>HEALTH</h3><dl class="detail-list">${detailRow("Connection", stateLabel(c.state))}${detailRow("RTSP", c.rtsp ? "Connected" : "Not connected")}${detailRow("ONVIF", c.onvif ? "Connected" : "Not available")}${detailRow("Last frame", c.lastFrame ? formatTime.format(new Date(c.lastFrame)) : null)}${detailRow("Last seen", c.lastSeen ? formatTime.format(new Date(c.lastSeen)) : null)}${detailRow("Reconnect attempts", c.reconnectAttempts)}</dl></section>
    <section class="detail-section"><h3>CAPABILITIES</h3><div class="capability-grid">${["liveStream", "audio", "onvif", "ptz", "motion"].map((key) => `<div class="capability ${caps[key] ? "yes" : ""}">${caps[key] ? "✓" : "—"} ${escapeHtml({ liveStream: "Live video", audio: "Audio", onvif: "ONVIF", ptz: "PTZ", motion: "Motion events" }[key])}</div>`).join("")}</div></section>
    ${caps.ptz ? `<section class="detail-section"><h3>PTZ CONTROL</h3><div class="ptz-pad"><span></span><button data-ptz="up">↑</button><span></span><button data-ptz="left">←</button><button data-ptz="stop">●</button><button data-ptz="right">→</button><button data-ptz="zoomOut">−</button><button data-ptz="down">↓</button><button data-ptz="zoomIn">＋</button></div></section>` : ""}
    <section class="detail-section"><h3>SYSTEM TELEMETRY</h3><dl class="detail-list">${detailRow("Uptime", c.uptime)}${detailRow("Temperature", c.temperature)}${detailRow("Storage", c.storageStatus)}${detailRow("Battery", c.battery)}${detailRow("Power status", c.powerStatus)}${detailRow("Night vision", c.nightVision)}${detailRow("Analytics", c.analytics)}</dl></section>`;
  $("#drawerBody")
    .querySelectorAll("[data-ptz]")
    .forEach((button) => button.addEventListener("click", () => sendPtz(id, button.dataset.ptz)));
  drawerBackdrop.hidden = false;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
}
async function sendPtz(id, direction) {
  try {
    await api(`/api/cameras/${id}/ptz`, { method: "POST", body: JSON.stringify({ direction }) });
    if (direction !== "stop") setTimeout(() => api(`/api/cameras/${id}/ptz`, { method: "POST", body: JSON.stringify({ direction: "stop" }) }).catch(() => {}), 350);
  } catch (error) {
    showToast(error.message);
  }
}
function closeDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  setTimeout(() => {
    drawerBackdrop.hidden = true;
  }, 220);
}
function resetModal() {
  form.reset();
  form.elements.rtspPort.value = 554;
  form.elements.onvifPort.value = 80;
  form.elements.channel.value = 1;
  testToken = null;
  editingId = null;
  testPanel.hidden = true;
  testPanel.className = "test-panel";
  $("#cameraError").textContent = "";
  $("#connectCamera").disabled = true;
  $("#connectCamera").textContent = "Connect camera";
  $(".modal-header h2").textContent = "Add camera";
  form.elements.password.required = true;
}
function openAdd() {
  resetModal();
  modal.showModal();
}

function openEdit(id) {
  const c = cameras.find((item) => item.id === id);
  if (!c) return;

  resetModal();
  editingId = id;

  $(".modal-header h2").textContent = "Edit Camera";
  $("#connectCamera").textContent = "Update camera";

  for (const key of ["name", "brand", "connectionType", "host", "rtspPort", "onvifPort", "username", "channel", "stream"]) {
    if (form.elements[key] && c[key] !== undefined) {
      form.elements[key].value = c[key];
    }
  }

  form.elements.password.value = "";
  form.elements.password.required = false;
  form.elements.password.placeholder = "Leave blank to keep current password";

  form.elements.remember.checked = c.remembered;

  modal.showModal();
}

function formData() {
  const data = Object.fromEntries(new FormData(form));
  data.remember = form.elements.remember.checked;

  if (editingId && !data.password) {
    delete data.password;
  }

  return data;
}
async function testCamera() {
  if (!form.reportValidity()) return;
  testToken = null;
  $("#connectCamera").disabled = true;
  $("#cameraError").textContent = "";
  testPanel.hidden = false;
  testPanel.className = "test-panel";
  $("#testTitle").textContent = "Testing connection";
  $("#testResults").innerHTML = "";
  const steps = ["Connecting to camera…", "Authenticating…", "Testing RTSP…", "Testing ONVIF…", "Detecting stream…", "Detecting capabilities…"];
  let index = 0;
  $("#testStep").textContent = steps[0];
  const progress = setInterval(() => {
    index = Math.min(index + 1, steps.length - 1);
    $("#testStep").textContent = steps[index];
  }, 1100);
  try {
    const result = await api("/api/cameras/test", { method: "POST", body: JSON.stringify(formData()) });
    clearInterval(progress);
    testToken = result.testToken;
    testPanel.classList.add("done");
    $("#testTitle").textContent = "Connection verified";
    $("#testStep").textContent = result.message;
    const chips = [
      ["Camera reachable", result.cameraReachable],
      ["RTSP working", result.rtspWorking],
      ["ONVIF working", result.onvifWorking],
      [result.codec, Boolean(result.codec)],
      [result.resolution, Boolean(result.resolution)],
      ["PTZ available", result.capabilities?.ptz],
    ];
    $("#testResults").innerHTML = chips
      .filter(([text, available]) => text && available)
      .map(([text]) => `<span class="result-chip ok">✓ ${escapeHtml(text)}</span>`)
      .join("");
    $("#connectCamera").disabled = false;
  } catch (error) {
    clearInterval(progress);
    testPanel.classList.add("failed");
    $("#testTitle").textContent = "Connection failed";
    $("#testStep").textContent = error.message;
    $("#cameraError").textContent = error.message;
  }
}
async function connectCamera() {
  if (!testToken) return;
  const button = $("#connectCamera");
  button.disabled = true;
  button.textContent = editingId ? "Updating…" : "Connecting…";
  try {
    if (editingId) await api(`/api/cameras/${editingId}`, { method: "PATCH", body: JSON.stringify(formData()) });
    else await api("/api/cameras/connect", { method: "POST", body: JSON.stringify({ testToken, remember: form.elements.remember.checked }) });
    modal.close();
    showToast(editingId ? "Camera updated" : "Camera connected");
    await loadCameras();
  } catch (error) {
    $("#cameraError").textContent = error.message;
    button.disabled = false;
    button.textContent = editingId ? "Update camera" : "Connect camera";
  }
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#loginError").textContent = "";
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    event.target.reset();
    showApp();
  } catch (error) {
    $("#loginError").textContent = error.message;
  }
});
$("#logout").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  showLogin();
});
$("#addCamera").addEventListener("click", openAdd);
$("#emptyAddCamera").addEventListener("click", openAdd);
$("#testCamera").addEventListener("click", testCamera);
$("#connectCamera").addEventListener("click", connectCamera);
form.addEventListener("submit", (event) => event.preventDefault());
modal.addEventListener("close", resetModal);
$("#closeDrawer").addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);
$("#fullscreenDashboard").addEventListener("click", () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()));
function clock() {
  const now = new Date();
  $("#dateText").textContent = compactDate.format(now);
  $("#timeText").textContent = compactTime.format(now);
  document.querySelectorAll(".timestamp").forEach((item) => {
    item.textContent = formatTime.format(now);
  });
}
clock();
setInterval(clock, 1000);
setInterval(() => {
  if (!app.hidden) loadCameras();
}, 3000);
api("/api/auth/session")
  .then((session) => (session.authenticated ? showApp() : showLogin()))
  .catch(showLogin);
const devicePage = $("#devicePage");
const demoCard = $("#demoDeviceCard");
let demoDevice = null;
let eventFilter = "All";
const deviceTabs = ["Overview", "Live View", "Channels", "Health", "Storage", "Events", "Network", "PTZ", "Information", "Settings"];
async function loadDemoCard() {
  try {
    const devices = await api("/api/devices");
    demoDevice = devices[0] || null;
    demoDataLoaded = true;
    updateHomeState();
  } catch (error) { demoDataLoaded = true; updateHomeState(); if (error.status !== 401) showToast(error.message); }
}
function dval(value) { return value === null || value === undefined || value === "" ? "Not available" : String(value); }
function drow(title, value) { return `<div><small>${escapeHtml(title)}</small><strong>${escapeHtml(dval(value))}</strong></div>`; }
function demoHeader() { return `<div class="device-page-header"><div><div class="badge-row"><button class="ghost-button back-dashboard" data-action="back">← Devices</button><span class="demo-badge">DEMO DEVICE</span><span class="online-pill">● ONLINE</span></div><h1>${escapeHtml(demoDevice.name)}</h1><p class="device-subtitle">${escapeHtml(demoDevice.brand)} · ${escapeHtml(demoDevice.model)} · ${escapeHtml(demoDevice.connection)}</p></div><div class="device-head-actions"><button class="primary" data-action="refresh">↻ Refresh</button><button class="ghost-button" data-action="reconnect">Reconnect</button><button class="secondary" data-tab="Settings">⚙ Settings</button></div></div>`; }
function demoBanner() { return ``; }
function overviewPanel() {
 const o=demoDevice.overview,h=demoDevice.health;
 const rows=[drow("Model",demoDevice.model),drow("Serial Number",demoDevice.serial),drow("Firmware Version",demoDevice.firmware),drow("Hardware Version",demoDevice.hardware),drow("Device ID",demoDevice.id),drow("MAC Address",o.macAddress)];
 const network=[drow("IP Address",o.ipAddress),drow("Gateway",o.gateway),drow("DNS",o.dns),drow("Current Time",new Date(o.currentTime).toLocaleString()),drow("Last Boot",new Date(o.lastBoot).toLocaleString()),drow("Uptime",o.uptime)];
 return `<div class="overview-layout"><section class="dash-panel overview-info"><div class="dash-panel-head"><h3>Device Overview</h3><span class="online-pill">● ONLINE</span></div><div class="overview-fields">${rows.join("")}</div></section><section class="dash-panel network-time-panel"><div class="dash-panel-head"><h3>Network & Time</h3><span class="stable-label">● Stable connection</span></div><div class="overview-fields">${network.join("")}</div></section><section class="dash-panel health-panel"><div class="dash-panel-head"><h3>Device Health</h3><span class="demo-badge">DEMO DATA</span></div><div class="health-grid">${healthCard("Temperature",`${h.temperature.value}${h.temperature.unit}`,"Normal")}${healthCard("Battery",`${h.battery.value}${h.battery.unit}`,"Healthy")}${healthCard("CPU Load",`${h.cpu.value}%`,"Normal")}${healthCard("Memory",`${h.memory.value}%`,"Normal")}${healthCard("Storage",`${h.storage.value}%`,"Healthy")}${healthCard("Network",h.network,"Stable")}${healthCard("Recording","● ACTIVE","4 Channels")}</div></section></div>`;
}function healthCard(name,value,sub) { const pct=String(value).match(/^(\d+)%$/)?.[1]; return `<div class="health-card"><span class="stat-label">${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong>${pct?`<div class="health-bar"><span style="width:${pct}%"></span></div>`:""}<small>${escapeHtml(sub)}</small></div>`; }
function livePanel() { return `<section class="dash-panel"><div class="dash-panel-head"><h3>Live View</h3><span class="demo-badge">DEMO FEED</span></div><div class="demo-live-grid">${demoDevice.channels.map(c=>`<div class="demo-live-tile ${c.status}"><header><b>CH ${c.id} · ${escapeHtml(c.name)}</b><span class="channel-state ${c.status}">● ${c.status.toUpperCase()}</span></header><span class="demo-feed-mark">${c.status==="offline"?"⊘":"◉"}</span><div class="tile-footer"><span>${c.status==="offline"?"NO SIGNAL":"SIMULATED PREVIEW"}</span><span>${escapeHtml(c.resolution)} · ${c.fps?`${c.fps} FPS`:"—"}</span></div></div>`).join("")}</div><p class="muted">A live stream is not available for this demo device. Existing camera HLS playback remains available on the Devices page.</p></section>`; }
function channelsPanel() { return `<section class="dash-panel"><div class="dash-panel-head"><h3>Channels <span class="muted">· 4</span></h3><span class="demo-badge">SIMULATED</span></div><div class="channel-grid">${demoDevice.channels.map(c=>`<article class="channel-card"><div class="channel-card-head"><div><h4>CH ${c.id} · ${escapeHtml(c.name)}</h4><p>${escapeHtml(c.streamType)} stream · ${escapeHtml(c.signal)} signal</p></div><span class="channel-state ${c.status}">● ${c.status.toUpperCase()}</span></div><div class="channel-specs">${[["Resolution",c.resolution],["Frame rate",c.fps?`${c.fps} FPS`:null],["Codec",c.codec],["Bitrate",c.bitrate],["Audio",c.audio],["Recording",c.recording],["Motion",c.motion],["Last frame",c.lastFrame]].map(([k,v])=>`<span>${k}<b>${escapeHtml(dval(v))}</b></span>`).join("")}</div><div class="channel-actions"><button disabled title="Demo stream unavailable">View Live · Demo</button><button disabled>Snapshot</button><button disabled>Playback</button><button disabled>Channel Settings</button></div></article>`).join("")}</div></section>`; }
function storagePanel() { const s=demoDevice.storage,d=s.disks[0]; return `<section class="dash-panel"><div class="dash-panel-head"><h3>Storage & HDD</h3><span class="demo-badge">SIMULATED</span></div><div class="storage-summary">${[["Total Storage",s.total],["Used Storage",s.used],["Free Storage",s.free],["Recording Status",s.recording]].map(([k,v])=>`<div class="storage-metric"><strong>${escapeHtml(v)}</strong><small>${k}</small></div>`).join("")}</div><div class="disk-row"><div class="disk-row-head"><strong>◉ ${d.name}</strong><span class="online-pill">● ${d.status}</span></div><div class="storage-bar"><span style="width:${d.usage}%"></span></div><div class="muted" style="font-size:.69rem;margin-top:6px">${d.used} GB of ${d.capacity} GB used · ${d.usage}%</div><dl>${[["Capacity",`${d.capacity/1000} TB`],["Used",`${d.used} GB`],["Free",`${d.free} GB`],["Temperature",`${d.temperature}°C`],["Recording",d.recording],["Estimated time",s.estimatedRecordingTime]].map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl></div></section>`; }
function eventsPanel() { const filters=["All","Critical","Warning","Info","Motion","System"]; const rows=demoDevice.events.filter(e=>eventFilter==="All"||e.severity===eventFilter.toLowerCase()||e.type===eventFilter); return `<section class="dash-panel"><div class="dash-panel-head"><h3>Events & Alerts</h3><span class="demo-badge">SIMULATED</span></div><div class="filter-row">${filters.map(f=>`<button class="filter-chip ${eventFilter===f?"active":""}" data-filter="${f}">${f}</button>`).join("")}</div><div class="event-list">${rows.map(e=>`<div class="event-row"><span class="event-dot ${e.severity}"></span><div><strong>${escapeHtml(e.title)}</strong><small>${escapeHtml(e.type)} · ${escapeHtml(e.channel)}</small></div><time>${escapeHtml(e.time)}</time></div>`).join("")||'<p class="muted">No matching events.</p>'}</div></section>`; }
function networkPanel() { const n=demoDevice.network; return `<section class="dash-panel"><div class="dash-panel-head"><h3>Network</h3><span class="demo-badge">SIMULATED</span></div><div class="network-hero"><span class="online-pill">●</span><div><small class="stat-label">Connection status</small><div class="big-value">${n.connectionStatus}</div></div><span class="demo-badge">${n.quality} quality</span></div><div class="overview-fields" style="margin-top:20px">${Object.entries(n).filter(([k])=>k!=="dataSource"&&k!=="quality"&&k!=="connectionStatus").map(([k,v])=>drow(k.replace(/[A-Z]/g,m=>` ${m}`).replace(/^./,m=>m.toUpperCase()),v)).join("")}</div></section>`; }
function ptzPanel() { return `<div class="ptz-layout"><section class="dash-panel"><h3>Pan · Tilt · Zoom</h3><div class="ptz-pad large"><span></span>${ptzButton("up","↑")}<span></span>${ptzButton("left","←")}${ptzButton("center","●")}${ptzButton("right","→")}${ptzButton("zoomOut","−")}${ptzButton("down","↓")}${ptzButton("zoomIn","＋")}</div><p class="muted">Controls are display-only in simulation. Channel 2 reports PTZ capability; movement is not sent.</p><label class="muted">Speed <select class="small-select"><option>3 · Normal</option><option>1 · Slow</option><option>5 · Fast</option></select></label></section><section class="dash-panel"><h3>Focus · Iris · Presets</h3><div class="channel-actions">${["Focus +","Focus −","Iris +","Iris −","Preset 1","Preset 2","Preset 3"].map(x=>`<button disabled>${x}</button>`).join("")}</div><p class="ptz-unavailable" style="margin-top:14px">PTZ not supported on Channels 1, 3, and 4.</p></section></div>`; }
function ptzButton(action,text) { return `<button type="button" data-ptz="${action}" aria-label="${action}">${text}</button>`; }
function infoPanel() { const c=demoDevice.capabilities; return `<section class="dash-panel"><div class="dash-panel-head"><h3>Device Information</h3><span class="demo-badge">SIMULATED</span></div><div class="info-grid"><div class="overview-fields">${drow("Manufacturer","CP Plus (simulated)")}${drow("Brand",demoDevice.brand)}${drow("Model",demoDevice.model)}${drow("Serial Number",demoDevice.serial)}${drow("Firmware",demoDevice.firmware)}${drow("Hardware",demoDevice.hardware)}${drow("Device ID",demoDevice.id)}${drow("MAC",demoDevice.overview.macAddress)}${drow("IP",demoDevice.overview.ipAddress)}${drow("Protocol","RTSP / ONVIF (capability only)")}${drow("Connection Type",demoDevice.connection)}</div><div class="capability-grid">${[["Channels",`${c.channels} channels`],["Storage",c.storage],["PTZ Support","Channel 2 only"],["Audio Support",c.audio],["Alarm Support",c.alarm],["Motion Detection",c.motionDetection],["P2P",c.p2p],["ONVIF",c.onvif],["RTSP",c.rtsp]].map(([k,v])=>`<div class="capability ${v?"yes":""}">✓ ${k}: ${v===true?"Supported":v===false?"Not supported":v}</div>`).join("")}</div></div></section>`; }
function settingsPanel() { return `<section class="dash-panel"><h3>Device Settings</h3><p class="muted">Configuration actions are unavailable for the simulated device.</p><div class="channel-actions"><button disabled>Device Configuration</button><button disabled>Time & Date</button><button disabled>Users & Permissions</button><button disabled>Firmware Update</button></div></section>`; }
function renderDevice(tab="Overview") { if(!demoDevice)return; const bodies={"Overview":overviewPanel,"Live View":livePanel,"Channels":channelsPanel,"Health":()=>`<section class="dash-panel"><div class="dash-panel-head"><h3>Device Health</h3><span class="demo-badge">DEMO DATA</span></div><div class="health-grid">${healthCard("Temperature","42°C","Normal")}${healthCard("Battery","87%","Healthy")}${healthCard("Power","AC / Backup","Stable")}${healthCard("CPU Usage","31%","Normal")}${healthCard("Memory","54%","Normal")}${healthCard("Storage","68%","Healthy")}${healthCard("Network","Excellent","Stable")}${healthCard("Recording","ACTIVE","4 Channels")}${healthCard("Motion","NORMAL","Enabled")}</div></section>`,"Storage":storagePanel,"Events":eventsPanel,"Network":networkPanel,"PTZ":ptzPanel,"Information":infoPanel,"Settings":settingsPanel}; devicePage.innerHTML=`${demoHeader()}${demoBanner()}<nav class="device-tabs" aria-label="Device details">${deviceTabs.map(t=>`<button class="device-tab ${t===tab?"active":""}" data-tab="${t}">${t}</button>`).join("")}</nav>${(bodies[tab]||overviewPanel)()}`; bindDevicePage(); }
function openDemo() { if(!demoDevice)return; grid.hidden=true;emptyState.hidden=true;demoCard.hidden=true;devicePage.hidden=false;renderDevice();window.scrollTo({top:0,behavior:"smooth"}); }
function backDevices() { devicePage.hidden=true;updateHomeState();window.scrollTo({top:0,behavior:"smooth"}); }
function bindDevicePage() { devicePage.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>renderDevice(b.dataset.tab))); devicePage.querySelector('[data-action="back"]')?.addEventListener("click",backDevices); devicePage.querySelector('[data-action="refresh"]')?.addEventListener("click",async()=>{await loadDemoCard();const active=devicePage.querySelector(".device-tab.active")?.textContent||"Overview";renderDevice(active);showToast("Demo data refreshed");}); devicePage.querySelector('[data-action="reconnect"]')?.addEventListener("click",async()=>{await api(`/api/devices/${demoDevice.id}/reconnect`,{method:"POST",body:"{}"});showToast("Demo device is already online");}); devicePage.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>{eventFilter=b.dataset.filter;renderDevice("Events")})); devicePage.querySelectorAll("[data-ptz]").forEach(b=>b.addEventListener("click",()=>showToast("PTZ is simulated; no movement was sent"))); }
demoCard.addEventListener("click",openDemo);
document.querySelector("[data-menu]")?.addEventListener("click",()=>document.querySelector(".desktop-nav")?.classList.toggle("open"));
document.querySelectorAll("[data-home]").forEach(button=>button.addEventListener("click",()=>{backDevices();document.querySelectorAll(".main-nav").forEach(nav=>nav.classList.toggle("active",nav.textContent===button.textContent));}));
document.querySelectorAll("[data-device-tab]").forEach(button=>button.addEventListener("click",()=>{if(!demoDevice){showToast("No demo device is available");return;}openDemo();renderDevice(button.dataset.deviceTab);}));













