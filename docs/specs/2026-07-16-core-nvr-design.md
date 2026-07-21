# Camera Dashboard — Core NVR Design (Phases 1–3)

Date: 2026-07-16
Status: approved design, pre-implementation

## 1. Goal & scope

A custom-built, self-hosted camera dashboard for 1–4 Wyze cameras (currently one Wyze Cam v3 via native RTSPS). This spec covers **Phases 1–3**:

1. Live multi-camera grid (WebRTC, sub-second latency)
2. Continuous 24/7 recording + on-demand snapshots
3. Timeline playback with 7-day retention

Out of scope (future specs): motion/object detection (Phase 4 — planned exit ramp to Frigate), camera settings via wyze-bridge (Phase 5), app-level authentication.

### Decisions

| Topic | Decision |
|---|---|
| Language | TypeScript everywhere (server + web-app) |
| Hosting | Develop on macOS (Docker Desktop), deploy to personal Linux server via docker-compose |
| Recording | Continuous 24/7, auto-start for every enabled camera; no manual start/stop |
| Retention | 7 days continuous (configurable per camera), plus low-disk safety valve |
| Access | LAN + Tailscale VPN; no app auth for now (add later if needed) |
| Recording format | Segmented MP4 (~60s files, `-c copy`) indexed in SQLite — chosen over rolling HLS playlists and over Frigate-as-backend |
| API shapes | Loosely mirror Frigate's API (`recordings`, `recordings/summary`, VOD-style playback URLs) to keep the Phase 4 Frigate swap cheap |
| UI | Mobile-first React; Tailwind CSS |

### Success criteria

- Live view of all cameras in a browser (phone + desktop) with <1s latency on LAN.
- 7 complete days of footage on disk per camera; older footage auto-deleted.
- Scrub to any moment in the last 7 days and play it within a couple of seconds.
- Recorder survives camera drops, server restarts, and disk pressure without manual intervention.

## 2. System overview

### docker-compose services

```yaml
services:
  go2rtc:    # alexxit/go2rtc — connects to each camera once, fans out streams
  server:    # Node.js/Express (TS) — API + RecorderManager + retention + SQLite
  web-app:   # React (TS) — dev: Vite HMR; prod: static build
  nginx:     # prod entry point — serves web-app build, proxies /api and /recordings
```

- **go2rtc is the only component that touches cameras.** It consumes each camera's `rtsps://` URL (credentials from `.env`) and restreams: WebRTC/MSE to browsers, plain RTSP on the Docker network to the recorder, `frame.jpeg` snapshots. Wyze cams cannot handle multiple direct RTSP clients.
- **Camera config single source of truth:** one `cameras.yml` defines id, name, RTSPS URL (env-interpolated), enabled flag, retention days. It generates the go2rtc config and is read by the server at startup (synced into the `cameras` table).
- **Environments:** dev on Mac uses Vite dev server + tsx watch, WebRTC over pinned UDP ports with TCP fallback (Docker Desktop has no host networking). Prod on Linux uses `network_mode: host` for go2rtc and nginx as the single entry port.
- **Volumes:** `./recordings` (MP4 segments + snapshots) and `./data` (SQLite), bind-mounted so the Linux server can place them on a large disk. Paths in the DB are relative to the recordings root, so the volume can move without a DB rewrite.
- **Secrets:** camera credentials/IPs in `.env` (gitignored); compose files and config templates are committable.

### Data flow

```
Camera (rtsps) ──► go2rtc ──► WebRTC ──► browser live grid (<1s)
                     │
                     └──► rtsp restream ──► ffmpeg (RecorderManager) ──► 60s MP4 segments
                                                                             │
browser timeline ◄── hls.js ◄── VOD playlist (API) ◄── SQLite segment index ◄┘
```

## 3. Server design

One Node process per the `server` container:

```
server (single Node process)
├── Express HTTP API
├── RecorderManager (module)
│     • spawns one `ffmpeg -c copy` child process per enabled camera
│     • watches recordings dir; indexes completed segments into SQLite
│     • restarts dead ffmpeg processes with exponential backoff
│     • emits status events (recording / retrying / disabled)
├── RetentionJob (hourly)
└── SQLite via better-sqlite3 (WAL mode, single writer process)
```

**Why in-process rather than a separate recorder container:** the API needs live recorder state and the recorder needs the same camera config and DB; one process makes that a function call instead of an internal RPC layer. ffmpeg still runs as separate OS processes, so encoder crashes cannot take Node down. Docker `restart: unless-stopped` covers Node crashes (max ~1 minute of lost footage thanks to segmenting).

**Escape hatch:** RecorderManager has a narrow interface — `start(camera)`, `stop(camera)`, `status()`, `segment-written` event — so it can later be lifted into its own container by putting HTTP in front of the same interface.

### Recording pipeline

Per camera:

```sh
ffmpeg -rtsp_transport tcp -i rtsp://go2rtc:8554/<camId> \
  -c copy -f segment -segment_time 60 -segment_atclocktime 1 \
  -reset_timestamps 1 -strftime 1 \
  /recordings/<camId>/%Y-%m-%d/%H-%M-%S.mp4
```

- Input is go2rtc's plain RTSP restream on the Docker network; camera TLS/credentials remain go2rtc's concern.
- `-c copy`: no re-encoding, near-zero CPU per camera.
- `-segment_atclocktime 1`: segments align to wall-clock minute boundaries, so every file starts at `:00` seconds and timeline math is trivial.

**Disk layout:**

```
recordings/
  cam1/2026-07-16/15-04-00.mp4        # one folder per camera per day
  snapshots/cam1/2026-07-16T15-04-22.jpg
```

**Indexing:** a directory watcher (chokidar) detects each new segment file; the *previous* segment is then complete → probe real duration with ffprobe and insert its row. On startup, a **reconciliation scan** heals the DB against the disk (adds missing rows, drops rows for missing files). The filesystem is the source of truth; the DB is a queryable index.

**Retention:** hourly job deletes segments older than the camera's retention (default 7 days), removes rows, prunes empty day folders. Safety valve: if disk free space drops below a configurable threshold (default 10 GB), delete oldest segments regardless of age.

### Error handling

| Failure | Behavior |
|---|---|
| Camera offline / ffmpeg exits | RecorderManager restarts with exponential backoff (1s doubling to a 60s cap, retries forever); status `retrying` pushed over WebSocket |
| Node/server crash | Docker restarts container; reconciliation scan heals index; ffmpeg re-spawned; ≤1 min footage lost |
| Disk near full | Safety-valve deletion of oldest segments; warning pushed over WebSocket and shown in top bar |
| Partial/corrupt last segment | Reconciliation probes with ffprobe; unreadable files are skipped (not indexed) |

## 4. API surface

Nine HTTP endpoints + one WebSocket.

| # | Endpoint | Purpose |
|---|---|---|
| 1 | `GET /api/cameras` | Camera list: id, name, enabled, live stream URLs (go2rtc), recorder state |
| 2 | `GET /api/cameras/:id/latest.jpg` | Current frame (proxied from go2rtc) for posters/thumbnails |
| 3 | `GET /api/system/status` | Disk free/used, per-camera recorder uptime and restart counts, DB size |
| 4 | `POST /api/cameras/:id/snapshot` | Capture + persist snapshot; returns metadata |
| 5 | `GET /api/snapshots?camera=&from=&to=` | List saved snapshots |
| 6 | `GET /api/recordings?camera=&from=&to=` | Segment list (start, duration, path) for a range |
| 7 | `GET /api/recordings/summary?camera=` | Hour-bucket coverage counts for cheap timeline rendering (mirrors Frigate) |
| 8 | `GET /api/recordings/:camera/start/:ts/end/:ts/index.m3u8` | On-the-fly HLS VOD playlist stitching MP4 segments in range; hls.js handles cross-segment seeking (mirrors Frigate `/vod/...`) |
| 9 | `GET /recordings/*` | Static range-request serving of MP4/JPG files (nginx in prod, Express static in dev) |
| 10 | `WS /api/ws` | Push recorder state changes and disk warnings to the UI |

Deliberately absent: record start/stop (recording is continuous), auth (Tailscale), settings (Phase 5), events/detection (Phase 4 — slots into these shapes).

## 5. Database schema

SQLite at `./data/nvr.db`, WAL mode, better-sqlite3. Four tables:

```sql
CREATE TABLE cameras (
  id          TEXT PRIMARY KEY,          -- 'cam1' (slug from cameras.yml)
  name        TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL           -- unix ms
);

CREATE TABLE segments (
  id          INTEGER PRIMARY KEY,
  camera_id   TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  start_ts    INTEGER NOT NULL,          -- unix ms, from filename
  duration_ms INTEGER NOT NULL,          -- real duration via ffprobe
  path        TEXT NOT NULL UNIQUE,      -- relative to recordings root
  size_bytes  INTEGER NOT NULL
);
CREATE INDEX idx_segments_camera_time ON segments (camera_id, start_ts);

CREATE TABLE snapshots (
  id          INTEGER PRIMARY KEY,
  camera_id   TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  ts          INTEGER NOT NULL,
  path        TEXT NOT NULL UNIQUE,
  size_bytes  INTEGER NOT NULL
);
CREATE INDEX idx_snapshots_camera_time ON snapshots (camera_id, ts);

CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL
);
```

Notes:

- Worst case ≈ 40k segment rows (7 days × 4 cams × 1440/day) — summaries are computed with `GROUP BY` on hour buckets; no materialized summary table.
- Live recorder state is in-memory only (re-derived on restart); no state table.
- Phase 4 adds an `events` table without touching existing tables.
- Migrations: numbered `.sql` files applied at boot, tracked in `schema_migrations`.

## 6. Client design (mobile-first)

React + TypeScript + Vite + Tailwind CSS. Two screens; base styles target phones, `min-width` breakpoints expand to desktop.

### Live grid (home, `/`)

- **Phone:** full-width 16:9 tiles stacked vertically; bottom tab bar (Live / Timeline). Tap tile → fullscreen live view with overlay controls (snapshot, back). Off-screen tiles pause their streams (IntersectionObserver) and show `latest.jpg` posters to save bandwidth/battery.
- **Desktop:** tiles flow into a grid (`auto-fit, minmax(400px, 1fr)`; 2×2 at 4 cams); tabs move to the top bar.
- Tile overlay: status badge (`REC` / `retrying`, live via WebSocket), camera name, fullscreen, snapshot.
- Live video via go2rtc's `video-stream` web component (WebRTC, MSE fallback); `playsinline` for iOS.

### Timeline (`/timeline/:cameraId`)

- Player (hls.js) on a VOD window from endpoint #8; controls below the player on phones (not overlaid), speed 1x/2x/4x, snapshot-from-recording, fullscreen.
- **Timeline strip:** canvas-rendered 24h coverage bars fed by `recordings/summary`; gaps = no footage. Built on **pointer events** from day one: drag = scrub, pinch = zoom (phone); wheel-zoom + hover tooltips added on desktop. Strip height ≥44px for touch.
- Camera selector + date pager; days beyond retention greyed out.
- Landscape phone: fullscreen player with strip overlaid at the bottom.

### Component tree & state

```
<App>
 ├─ <TabBar>            bottom on phone, top on desktop; disk gauge
 ├─ <LiveGrid>
 │   └─ <CameraTile>    go2rtc video-stream + <TileOverlay>
 └─ <TimelinePage>
     ├─ <PlaybackPlayer>  hls.js wrapper
     ├─ <TimelineStrip>   canvas coverage + playhead (pointer events)
     └─ <CameraSelect> / <DatePicker>
```

- Zustand store for camera list + WebSocket-driven status; plain fetch hooks for server data.
- Mobile details: viewport meta, `100dvh`, safe-area insets for the bottom tab bar.

## 7. Testing

- **Server unit tests (vitest):** RecorderManager state machine (spawn/backoff/status) with a mocked child_process; retention logic against a temp dir + in-memory SQLite; VOD playlist generation from fixture segment rows; reconciliation scan (disk↔DB healing).
- **API integration tests:** supertest against the Express app with a temp SQLite DB and fixture recordings dir.
- **Client:** component tests (vitest + testing-library) for TimelineStrip pointer interactions and grid responsiveness logic; manual verification on iPhone Safari + desktop Chrome for streams (WebRTC is impractical to test headlessly).
- **End-to-end smoke (manual per phase):** compose up → live video visible; segments appear on disk and in `/api/recordings`; scrub yesterday's footage.

## 8. Build phases (this spec)

1. **Phase 1 — live:** compose skeleton (go2rtc + web-app), `cameras.yml`, live grid on phone + desktop.
2. **Phase 2 — record:** server container, RecorderManager + segment indexing, snapshots, system status, WebSocket badges.
3. **Phase 3 — timeline:** recordings/summary/VOD endpoints, retention job + disk safety valve, timeline UI, nginx prod config, deploy to Linux server.

## 9. Future (out of scope, designed for)

- **Phase 4 — detection:** either lightweight ffmpeg motion detection feeding a new `events` table, or swap the recording backend to Frigate — API shapes were chosen to make that swap cheap.
- **Phase 5 — settings:** optional wyze-bridge container for night vision/quality controls.
- **Auth:** app-level login if the dashboard is ever exposed beyond Tailscale.
