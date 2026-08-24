# Camera Dashboard

Self-hosted camera dashboard (NVR). Live view of all configured cameras in the
browser — phone and desktop — with sub-second latency, 24/7 recording to disk,
and a timeline for reviewing footage. Runs via Docker Compose.

## How it works

```
Wyze cam ──(1 rtsps connection)──▶ go2rtc ──▶ WebRTC / MSE ──▶ browser grid
                                          └─▶ rtsp://:8554/<id> ──▶ recorder ──▶ 60s MP4 segments ──▶ timeline playback
```

- **go2rtc** connects once to each camera and restreams to any number of
  viewers (WebRTC first, MSE fallback).
- **web-app** is a React + Tailwind client with two tabs: **Live** (grid of
  live tiles — offscreen tiles pause to a still poster, click a tile for
  fullscreen) and **Timeline** (per-camera playback with date picker,
  zoomable 24h timeline strip, scrubbing, and 1x/2x/4x speed via hls.js).
  Light/dark theme included. In dev it runs Vite with `/go2rtc` and `/api`
  proxies (static files under `/api/statics/recordings`).
- **server** is a Node/Express container that records 24/7 from go2rtc's
  RTSP restream into 60s MP4 segments, indexes them in SQLite, serves the
  API + status WebSocket, captures snapshots, serves recordings as HLS VOD
  for the timeline, and enforces retention (per-camera age limit plus a
  disk-free safety valve).
- **`cameras.yml` is the single source of truth** for cameras. `go2rtc.yaml`
  and `web-app/public/cameras.json` are generated from it — never edit those
  by hand.
- **Secrets live only in `.env`** (gitignored). Committed files reference
  `${ENV_VARS}` placeholders that go2rtc resolves at runtime.

## Prerequisites

- Docker + Docker Compose
- Cameras reachable on your network with RTSP/RTSPS enabled

> **No host installs:** all Node tooling runs inside Docker. Root `package.json`
> contains only convenience scripts that delegate to `docker compose`.

## Quick start

```bash
git clone <repo-url> camera-dashboard
cd camera-dashboard

# 1. Secrets
cp .env.example .env
#    - set CAM1_RTSP_URL (see "Camera URL format" below)
#    - set HOST_IP to this machine's LAN IP (macOS: ipconfig getifaddr en0)

# 2. Generate configs from .env
npm run setup

# 3. Bring up the stack (go2rtc + server + web-app)
docker compose up -d

# 4. Open it
open http://localhost:5173          # or http://<host-ip>:5173 from a phone
```

Verify the streams directly:

```bash
curl -s http://localhost:1984/api/streams | python3 -m json.tool   # producers: 1 per camera
open "http://localhost:1984/api/frame.jpeg?src=cam1"               # snapshot
```

## Adding (or removing) a camera

Cameras are detected from numbered `CAMn_RTSP_URL` variables in `.env`.

1. **Add the URL to `.env`:**

   ```sh
   CAM3_RTSP_URL=ffmpeg:rtsps://user:pass@192.168.68.42:322/stream0#video=copy#audio=copy
   ```

2. **Sync:**

   ```bash
   npm run setup
   ```

   This adds `cam3` ("Camera 3") to `cameras.yml` and regenerates
   `go2rtc/go2rtc.yaml` + `web-app/public/cameras.json`.

3. **Rename it (optional):** edit the `name:` field for `cam3` in
   `cameras.yml`. Manual edits to `name`, `enabled`, and `retention_days` are
   preserved by future syncs.

4. **Reload go2rtc with the new env var:**

   ```bash
   docker compose up -d --force-recreate go2rtc
   ```

   > `docker compose restart` is NOT enough — it does not reload `env_file`.

5. Reload the browser. The new tile appears.

**Removing a camera:** delete its `CAMn_RTSP_URL` line from `.env`, run
`npm run setup`, and force-recreate go2rtc.

### Camera URL format

Wyze cams (native RTSPS firmware, port 322) need go2rtc's ffmpeg producer —
go2rtc's built-in RTSP client cannot negotiate with Wyze's RTSPS server
(connection accepted, then i/o timeout). Wrap the URL like this:

```
ffmpeg:rtsps://user:pass@<camera-ip>:322/stream0#video=copy#audio=copy
```

`#video=copy#audio=copy` passes streams through without transcoding, so CPU
cost is negligible. Cameras with a well-behaved RTSP server can use a plain
`rtsp://` URL without the wrapper.

## Deploying on a server

Production install uses a **download folder**: copy
`download/docker-compose.yml` and `download/example.env` to a directory on the
server, configure `.env`, generate configs, and run Compose. Full steps are in
**[download/README.md](download/README.md)**.

Summary ([full guide](download/README.md)):

```bash
mkdir camera-dashboard && cd camera-dashboard
curl -fsSL -o docker-compose.yml \
  https://github.com/jorcalle11/camera-dashboard/releases/latest/download/docker-compose.yml
curl -fsSL -o example.env \
  https://github.com/jorcalle11/camera-dashboard/releases/latest/download/example.env
cp example.env .env
# edit .env — cameras, HOST_IP, paths
docker compose --profile setup run --rm cameras-setup
docker compose pull && docker compose up -d
```

Images are always `ghcr.io/jorcalle11/camera-dashboard/*:latest` (defined in `docker-compose.yml`).
Every merge to `main` auto-bumps the patch version, rebuilds images, and publishes a
GitHub Release — see `.github/workflows/release.yml`.

Open `http://<server-ip>:<WEB_UI_PORT>` (see `WEB_UI_PORT` in `.env`). Use Tailscale for remote
access; do not expose go2rtc :1984 on the public internet.

For **development** on the server (Vite on :5173), clone the repo and use
`npm run setup` + `docker compose up -d` from the repository root instead.

## Commands

| Command | Where | What |
|---|---|---|
| `npm run setup` | root | Sync `.env` cameras -> `cameras.yml` -> generated configs |
| `npm run test` | root | Run tests in all workspaces inside containers |
| `npm run dev` | root | Start go2rtc + server + web-app in Docker |
| `docker compose logs go2rtc --since 5m` | root | Debug camera connections |

## Project structure

```
├── .env.example          # secrets template (copy to .env — never committed)
├── .github/workflows/    # release.yml — auto-release on merge to main
├── cameras.yml           # single source of truth (managed by npm run setup)
├── docker-compose.yml    # dev: go2rtc + server + Vite web-app
├── download/             # production install bundle (compose + example.env)
├── nginx/                # production UI image (used by download compose)
├── cameras-setup/        # config sync/generate tooling (TypeScript, vitest)
├── go2rtc/go2rtc.yaml    # GENERATED — go2rtc config (${VAR} placeholders only)
├── server/               # Node/Express API + recorder (RecorderManager,
│                         #   RetentionJob, segment indexer) + SQLite
└── web-app/              # React client (Vite + Tailwind)
    ├── public/cameras.json   # GENERATED — [{ id, name }] for the grid
    └── src/
        ├── components/   # LiveGrid, CameraTile, VideoStream, TabBar, TileOverlay,
        │                 #   TimelinePage, TimelineStrip, PlaybackPlayer, TransportBar,
        │                 #   DateSelect, CameraSelect, ThemeSwitcher
        ├── hooks/        # useCameras, useRecorderStatus, useRecordingsSummary,
        │                 #   useTheme, useToast
        └── lib/          # go2rtc.ts (URLs + web component loader), timeline.ts
```

## Features

Working today:

- **Live grid** — sub-second live view (WebRTC/MSE), mobile-first UI,
  fullscreen per tile, recorder status badges.
- **24/7 recording** — 60s MP4 segments per camera, SQLite index, snapshots,
  live status over WebSocket.
- **Timeline playback** — per-camera history with date picker, zoomable 24h
  strip showing recorded coverage, scrubbing, skip, and 1x/2x/4x speed
  (HLS VOD served from the recorded segments).
- **Retention** — per-camera `retention_days` in `cameras.yml` plus a
  `DISK_FREE_THRESHOLD_GB` safety valve that deletes oldest segments first.
- **Production deployment** — prebuilt GHCR images (server, nginx UI,
  cameras-setup), install bundle in `download/`, GitHub Actions release
  workflow on `v*` tags.

### For later

Not implemented yet:

- **Detection** — motion events (record/flag activity on the timeline).
- **Settings** — camera controls from the UI (night vision, quality).

## Troubleshooting

- **Tile shows nothing / go2rtc logs `i/o timeout` or `End of file`:** the
  camera's RTSP service is hung — power-cycle the camera. If the URL is
  missing the `ffmpeg:` wrapper on a Wyze cam, add it (see URL format above).
- **Changed `.env` but nothing happened:** `docker compose up -d
  --force-recreate go2rtc` (restart doesn't reload env vars).
- **WebSocket 403 from go2rtc:** it rejects `Origin` headers that don't match
  its host. The dev proxy rewrites `Origin` (see `web-app/vite.config.ts`) —
  any future reverse proxy must do the same.
- **Video works on desktop but not on the phone:** check `HOST_IP` in `.env`
  matches the docker host's current LAN IP, then force-recreate go2rtc.
