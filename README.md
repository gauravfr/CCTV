# Sentinel CCTV Dashboard

## Modular dashboard UI

The mobile-first React application lives in `frontend/` and is built with Vite and TypeScript. It has authenticated routes for the monitoring overview, devices, device details, live view, events, and settings. Shared UI, providers, API clients, hooks, and device models are separated into `frontend/src/` modules. The Express API, RTSP/ONVIF services, HLS pipeline, and demo-device API are preserved. Express serves `frontend/dist/`; the production server exits with a clear build instruction if that bundle is missing.

### Run and build

```powershell
npm ci
npm run dev
```

The development command starts the Express API on port 3000 and Vite on port 5173. Vite proxies `/api` and `/stream` to Express. For an integrated production-style run:

```powershell
npm run build
npm start
```

Or use `npm run start:app` to build and start the server in one command. The integrated app is available at `http://localhost:3000`. Run `npm test` for frontend component/API-client and demo-provider tests, and `npm run check` for TypeScript and backend syntax checks.

For a frontend hosted separately from the API, set `VITE_API_BASE_URL` at build time to the API origin. HLS media requests use the same base URL. A future Capacitor wrapper must use HTTPS for remote API and HLS requests; camera RTSP access remains on the server and is not exposed to the mobile browser.

### API behavior used by the UI

- `GET /api/auth/session`, `POST /api/auth/login`, and `POST /api/auth/logout` manage the HTTP-only session.
- `GET /api/cameras` lists cameras; `GET /api/cameras/:id` reads one; `POST /api/cameras/test` tests a connection; `POST /api/cameras` adds a camera; `PATCH /api/cameras/:id` updates it; `DELETE /api/cameras/:id` removes it.
- `POST /api/cameras/:id/reconnect`, `POST /api/cameras/:id/snapshot`, and `POST /api/cameras/:id/ptz` control supported camera actions.
- `GET /api/devices/:id` returns the demo recorder and channel model; its reconnect endpoint preserves the existing demo behavior.
- `GET /stream/:id/live.m3u8` and related HLS assets carry browser playback from the existing server-side RTSP pipeline.
- Protected APIs continue to require authentication. Device-specific telemetry and PTZ remain explicitly unavailable or unsupported when the camera/provider does not supply them.

A real multi-camera dashboard for Dahua and CP Plus cameras, NVRs, DVRs, and XVRs. It tests RTSP with FFprobe, attempts ONVIF discovery, confirms that video frames arrive, and then converts RTSP to browser-compatible HLS with FFmpeg. Camera credentials never appear in API responses or browser stream URLs.

## Requirements

- Node.js 20 or newer
- FFmpeg and FFprobe available on `PATH`
- Network access from this server to each camera/NVR
- Camera credentials with RTSP access; ONVIF credentials if ONVIF is enabled

Check FFmpeg before setup:

```powershell
ffmpeg -version
ffprobe -version
```

## Setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create the local configuration:

   ```powershell
   @'
   PORT=3000
   NODE_ENV=development
   DASHBOARD_USERNAME=admin
   DASHBOARD_PASSWORD=replace-with-a-strong-password
   SESSION_SECRET=replace-with-at-least-32-random-characters
   CAMERA_ENCRYPTION_KEY=replace-with-a-64-character-hex-key
   '@ | Set-Content .env
   ```

3. Generate an encryption key:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Open `.env` and set:

   ```dotenv
   DASHBOARD_USERNAME=admin
   DASHBOARD_PASSWORD=choose-a-strong-password
   SESSION_SECRET=replace-with-a-long-random-session-secret
   CAMERA_ENCRYPTION_KEY=paste-the-generated-key-here
   ```

   Keep the same `CAMERA_ENCRYPTION_KEY`. Changing it makes remembered credentials unreadable.

5. Start the dashboard:

   ```powershell
   npm start
   ```

   Startup verifies the configured tools by launching `ffmpeg -version` and `ffprobe -version`. The server starts only after it prints:

   ```text
   FFmpeg: Ready
   FFprobe: Ready
   ```

   Executables are resolved in this order: `FFMPEG_PATH`/`FFPROBE_PATH`, the system `PATH`, then common WinGet `Gyan.FFmpeg` package and link directories.

6. Open **http://localhost:3000**, sign in, click **Add camera**, enter the device details, and click **Test connection**. The **Connect camera** button activates only after FFprobe receives real video frames.

## Adding a camera

Enter the camera name, brand, host, RTSP port, ONVIF port, username, password, channel, and stream. If **Remember this camera** is off, the complete configuration remains in server memory only and disappears when the server restarts. If it is on, credentials are encrypted with AES-256-GCM before being written to SQLite.

The custom RTSP URL is optional. Enter it without credentials when possible, for example `rtsp://10.10.10.20:554/custom/path`; the server inserts the supplied username/password. A custom URL must use the same host entered in the host field.

### Dahua RTSP

The common Dahua path is:

```text
rtsp://USERNAME:PASSWORD@HOST:554/cam/realmonitor?channel=CHANNEL&subtype=SUBTYPE
```

- Main stream: `subtype=0`
- Sub stream: `subtype=1`
- For a recorder, `channel` selects its attached camera

Firmware and OEM variations exist, so use the device manual or a custom URL if the template does not work.

### CP Plus compatibility

CP Plus products use several platforms, so the app does not treat one RTSP path as universal. It first attempts ONVIF stream-URI discovery, then the supplied custom URL, then known compatible templates. Exact support still depends on the model and firmware.

Enable ONVIF in the camera/NVR network settings, create an ONVIF user if the model requires one, and enter its HTTP/ONVIF port (often 80, 8000, 8080, or a model-specific value).

## Confirm the camera URL with VLC

Before troubleshooting the dashboard:

1. Open VLC.
2. Choose **Media → Open Network Stream**.
3. Paste the full RTSP URL.
4. Click **Play**.

If VLC cannot play it, check the address, RTSP port, credentials, channel, subtype, codec, and camera network before debugging the web app.

## H.264 and H.265

Browser HLS playback is most reliable with H.264. If the dashboard detects H.265/HEVC, it shows an unsupported-codec state rather than pretending playback works.

Server-side H.265-to-H.264 conversion can be enabled in `.env`:

```dotenv
STREAM_TRANSCODE_H265=true
```

Transcoding consumes substantial CPU. Prefer changing the camera sub-stream to H.264 when possible.

## Cameras in another office

An address such as `192.168.1.108` is private to the client's local network and cannot normally be reached from a server elsewhere on the internet.

Preferred remote-access order:

1. Site-to-site or client VPN
2. Private network tunnel
3. A managed local gateway/agent at the client's office
4. Secure RTSP forwarding through an authenticated, encrypted gateway

Direct public RTSP port forwarding is a last resort. Never expose the camera's admin interface directly to the internet. For remote dashboard access, use HTTPS plus a VPN or authenticated reverse proxy; do not publish this Node port directly.

## Real data policy

The dashboard shows online only after the streaming backend receives current HLS segments produced from real video. Manufacturer, model, firmware, serial number, hardware ID, MAC address, profiles, resolution, FPS, PTZ, and event capability come from ONVIF or FFprobe. If the device does not return an identity field, it is shown as **Not available**. Unsupported telemetry—including battery, power, temperature, storage, recording, night vision, analytics, or uptime—is also shown as **Not available**. No values or events are simulated.

ONVIF capability advertisement confirms that a service exists; it does not prove a specific motion rule, storage state, or night-mode state. Those fields stay unavailable until a model-specific API retrieves them.

## Troubleshooting

- **Camera unreachable:** verify routing, VPN/tunnel, host, and firewall.
- **Incorrect username or password:** confirm the RTSP/ONVIF user and URL-encode unusual characters if testing manually.
- **Wrong port:** check the device's Network/Port page; RTSP is commonly 554.
- **Wrong channel:** recorders may number channels differently. Test the URL in VLC.
- **ONVIF unavailable:** enable ONVIF, add an ONVIF user, and verify its port. Live RTSP can still work without ONVIF.
- **Stream timeout:** try the sub-stream, lower bitrate, use H.264, and verify network stability.
- **VPN/tunnel unavailable:** confirm the remote subnet route from the server computer; a browser computer reaching the VPN is not enough if Node runs elsewhere.
- **FFmpeg not found:** set full paths with `FFMPEG_PATH` and `FFPROBE_PATH` in `.env`.

## Security and production

- All camera APIs require a valid session.
- Login and API routes are rate-limited.
- Sessions are stored in local SQLite and use HTTP-only, same-site cookies.
- Remembered camera settings are encrypted at rest with AES-256-GCM.
- The app uses `spawn()` with argument arrays, never shell string execution.
- Errors are sanitized; FFmpeg commands, stack traces, RTSP URLs, and passwords are never returned.
- Helmet supplies security headers. Production cookies require HTTPS when `NODE_ENV=production`.
- Put production deployments behind HTTPS and network-level access controls.

To use a bcrypt dashboard password instead of plaintext configuration, generate a hash and set `DASHBOARD_PASSWORD_HASH`; then remove `DASHBOARD_PASSWORD` from `.env`.

## Model-dependent items

The exact RTSP path, ONVIF port, ONVIF user requirements, PTZ behavior, event subscription support, storage API, recording API, IR/night-mode API, and analytics telemetry depend on the exact Dahua or CP Plus model and firmware. Provide the model number/manual when those manufacturer-specific capabilities are required.
