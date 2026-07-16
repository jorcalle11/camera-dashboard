# Camera Dashboard — Project Notes

> Summary of the setup session and architecture discussion (2026-07-16).

## 1. Wyze Cam v3 RTSP setup (completed)

The camera runs Wyze's **native RTSPS** (RTSP over TLS) — no beta firmware flash was needed.

- **Stream URL:** `rtsps://jorcalle11:<password>@192.168.68.107:322/stream0`
- **Credentials:** username `jorcalle11`, password stored separately (10 chars, URL-safe specials only: `! * - _ . ~` to avoid URL-encoding issues)
- **Stream specs:** H.264, 1920x1080, 20 fps
- Possible lower-res substream: try `/stream1`

### Connectivity test results

| Test | Result |
|---|---|
| Ping 192.168.68.107 | OK, ~7ms, 0% loss |
| Port 322 (RTSPS) | Open |
| TLS handshake | TLSv1.3 OK |
| Certificate | `Wyze Labs / RTSP Server`, self-signed (expected) |

### Player findings

- **VLC 3.0.23 cannot play `rtsps://` at all** — its access modules don't support the scheme (confirmed via verbose logs: "no access module matched"). Not a config issue.
- **ffplay works** (installed via `brew install ffmpeg`):

```sh
ffplay -rtsp_transport tcp -fflags nobuffer -flags low_delay \
  "rtsps://jorcalle11:<password>@192.168.68.107:322/stream0"
```

### TODO (camera housekeeping)

- [ ] Reserve `192.168.68.107` in router DHCP so the IP never changes
- [ ] Optional: shell alias for the ffplay command

## 2. Goal — custom web UI for multiple cameras

Requirements gathered:

- 2–4 cameras
- Live multi-camera grid
- Snapshots / recording
- Playback / timeline review
- Motion or object detection
- Camera settings (night vision, quality)
- PTZ (note: **Wyze v3 hardware is fixed** — PTZ only applies if a Wyze Cam Pan is added later)
- Custom-built app (not ready-made Frigate/go2rtc UI)
- **Everything runs in Docker with docker-compose**

### Feasibility notes

- RTSP carries **video only** — camera settings (night vision, IR, quality) cannot be controlled over RTSP. Requires the unofficial Wyze API, exposed by `docker-wyze-bridge`'s REST API. Unofficial = may break when Wyze changes their API; needs Wyze credentials + API key.
- Decision: **use native RTSPS for all streaming**; add wyze-bridge later only as an optional settings module.

### Stack decision

Compared React+Express vs Next.js vs plain HTML/JS:

- **Chosen direction: React + Node.js/Express** (Next.js adds little for a private dashboard; plain JS gets painful for the timeline UI)
- The hard work is backend (recording pipeline, segments, events) — Express handles it naturally.

## 3. Architecture

### docker-compose services

```yaml
services:
  go2rtc:        # streaming gateway (alexxit/go2rtc)
  server:        # Node.js/Express API
  client:        # React UI (dev: Vite; prod: nginx serving static build + reverse proxy)
  recorder:      # ffmpeg recording worker (initially inside 'server')
  wyze-bridge:   # OPTIONAL phase 5 — camera settings control (mrlt8/wyze-bridge)
  frigate:       # OPTIONAL phase 4 — object detection (+ mosquitto for MQTT)
```

### Data flow

```
Camera (rtsps) ──► go2rtc ──► WebRTC ──► browser grid   (live, <1s)
                     │
                     └──► rtsp restream ──► ffmpeg (server) ──► /recordings HLS segments
                                                                    │
browser timeline ◄── hls.js ◄── nginx ◄── /api/recordings ◄── SQLite metadata
```

Key property: go2rtc connects to each camera **once**; live view, recording, and detection all feed off its restream (Wyze cams choke on multiple direct RTSP clients).

### Component details

- **go2rtc**: consumes native `rtsps://` URLs; serves WebRTC (sub-second) + MSE/HLS fallback; free snapshots via `/api/frame.jpeg?src=cam1`. Config YAML = single source of truth for cameras. WebRTC UDP ports are the tricky part on Docker Desktop for Mac (host networking unavailable — pin a UDP port range or rely on TCP fallback).
- **server (Express)**: `GET /api/cameras`, `POST /api/cameras/:id/snapshot`, `POST /api/cameras/:id/record/start|stop`, `GET /api/recordings?camera=&from=&to=`, WebSocket for live events. Spawns ffmpeg writing HLS segments (~10s chunks) to a `./recordings` volume. SQLite for metadata (no DB container needed). Retention job deletes old footage.
- **client (React)**: camera grid wrapping go2rtc's `video-stream` web component; timeline scrubber fed by `/api/recordings`, playback via hls.js; controls panel (snapshot, record, fullscreen; later settings via bridge). Dev = Vite container with bind-mounted source (hot reload); prod = multi-stage build → nginx, which also proxies `/api` and streams — one entry port.
- **Detection options**: Frigate (person/car/pet, MQTT events, CPU-heavy — Coral USB is the usual upgrade) vs lightweight ffmpeg scene-change motion detection (much lighter, less smart).
- **Secrets**: camera credentials/IPs in `.env`; compose + go2rtc config stay committable. `docker-compose.override.yml` for dev-only bits.

## 4. Build phases

1. **Phase 1:** go2rtc + client grid — live view in browser
2. **Phase 2:** server + snapshots + recording to disk
3. **Phase 3:** timeline playback UI + retention
4. **Phase 4:** detection (Frigate or ffmpeg motion) + alerts
5. **Phase 5:** wyze-bridge settings panel

## 5. Open questions (to settle before building)

1. TypeScript or plain JavaScript for server/client?
2. Long-term host — this Mac or a Linux box/NAS? (Affects WebRTC networking + detection hardware.)
3. Retention target — days of footage / disk budget?

---

*Status: planning only — no code written yet, per explicit instruction.*
