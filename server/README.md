# server

Node/Express container that does the NVR work: records 24/7 from go2rtc's
RTSP restream, indexes footage in SQLite, and serves the HTTP API + status
WebSocket used by the web app.

## What it does

- Reads the camera list from `cameras.yml` (mounted read-only).
- Waits for go2rtc, preloads every enabled stream, then spawns one ffmpeg
  process per enabled camera (`RecorderManager`), recording the go2rtc restream
  into **60-second MP4 segments** under `RECORDINGS_PATH/<cameraId>/`.
  Recording runs entirely in this container — no browser or web-app required.
- Indexes segments in SQLite (`indexer` scans on boot, then watches the
  filesystem with chokidar).
- Runs a `RetentionJob` that deletes segments older than each camera's
  `retention_days`, plus a disk safety valve: when free space drops below
  `DISK_FREE_THRESHOLD_GB`, oldest segments are deleted first.
- Broadcasts recorder + disk status over WebSocket at `/api/ws`.
- Captures snapshots via go2rtc's frame API.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness check |
| GET | `/api/cameras` | Camera list with recorder status |
| GET | `/api/cameras/:id/latest.jpg` | Live snapshot (proxied from go2rtc) |
| GET | `/api/cameras/:id/recordings` | Segment list (`?from=&to=` epoch ms) |
| GET | `/api/cameras/:id/recordings/summary` | Recorded coverage for a day (`?day=YYYY-MM-DD`) |
| GET | `/api/cameras/:id/snapshots` | Stored snapshots |
| POST | `/api/cameras/:id/snapshots` | Capture a snapshot |
| GET | `/api/recordings/:camera/start/:start/end/:end/index.m3u8` | HLS VOD playlist for a time range (epoch seconds) |
| GET | `/api/system/status` | Disk usage, DB size, recorder status |
| GET | `/api/statics/recordings/*` | Raw MP4 segments (static; nginx serves these directly in production) |
| WS | `/api/ws` | Recorder + disk status push |

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `GO2RTC_URL` | `http://go2rtc:1984` | go2rtc API base URL |
| `GO2RTC_RTSP_PORT` | `8554` | go2rtc RTSP restream port |
| `RECORDINGS_PATH` | `/recordings` | Segment storage root |
| `DATA_PATH` | `/data` | SQLite location (`nvr.db`) |
| `CAMERAS_YML_PATH` | `/workspace/cameras.yml` | Camera config |
| `DISK_FREE_THRESHOLD_GB` | `10` | Retention safety valve |
| `PORT` | `3000` | HTTP listen port |

## Development

Runs inside Docker via the repo root compose file (`tsx watch` in the `dev`
Dockerfile target):

```bash
docker compose up -d server
docker compose run --rm server npm test   # vitest
```

## Docker images

- `Dockerfile` — dev + prod targets, build context `./server` (used by the
  root compose file).
- `Dockerfile.release` — same stages with repo-root build context; built and
  pushed to GHCR as `camera-dashboard/server` by `.github/workflows/release.yml`.
