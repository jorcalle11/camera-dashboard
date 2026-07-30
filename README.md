# Camera Dashboard

Self-hosted camera dashboard (NVR in progress). Live view of all configured
cameras in the browser — phone and desktop — with sub-second latency, running
via Docker Compose.

## How it works

```
Wyze cam ──(1 rtsps connection)──▶ go2rtc ──▶ WebRTC / MSE ──▶ browser grid
                                          └─▶ rtsp://:8554/<id> (recorder, Phase 2)
```

- **go2rtc** connects once to each camera and restreams to any number of
  viewers (WebRTC first, MSE fallback).
- **web-app** is a React + Tailwind grid of live tiles (offscreen tiles pause
  to a still poster; click a tile for fullscreen). In dev it runs Vite with
  `/go2rtc` and `/api` proxies (static files under `/api/statics/recordings`).
- **server** is a Node/Express container that records 24/7 from go2rtc's
  RTSP restream into 60s MP4 segments, indexes them in SQLite, serves API + WebSocket,
  and captures snapshots.
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

Suitable for a LAN / homelab, with remote access via
[Tailscale](https://tailscale.com). Do **not** port-forward go2rtc or the API on
your router without authentication in front.

### Production (recommended)

Builds the web UI, runs the API/recorder in production mode, and serves
everything on one port via nginx. go2rtc's admin API (`:1984`) is **not**
published to the host — only `/go2rtc` through nginx (same as the Vite dev
proxy).

```bash
# on the server (Docker required)
git clone <repo-url> camera-dashboard
cd camera-dashboard

cp .env.example .env
# - fill in the real camera URLs
# - HOST_IP=<the SERVER's LAN IP>   <- critical: WebRTC advertises this address
# - HTTP_PORT=8080                 <- or 80 on Linux if nothing else uses it

npm run setup
npm run prod
```

Then:

- **Verify:** `curl -s http://localhost:8080/api/health` and open
  `http://<server-ip>:8080` (adjust port if `HTTP_PORT` differs).
- **Remote access:** install Tailscale on the server and your devices, then
  use `http://<tailscale-name>:8080` from anywhere.
- **If the server's IP changes:** update `HOST_IP` in `.env` and
  `docker compose -f docker-compose.prod.yml up -d --force-recreate go2rtc`.
- **Updates:** `git pull && npm run setup && npm run prod` rebuilds images and
  recreates containers.

All services use `restart: unless-stopped`, so the stack survives reboots.

TLS termination (e.g. Caddy or nginx on the host in front of `:8080`) is left
to your environment; this repo serves plain HTTP on the configured port.

### Development on the server

Same as [Quick start](#quick-start) — `docker compose up -d` with Vite on
`:5173` and the API on `:3000`. Useful when hacking on the machine; use
**Production** for a stable install you share with the household.

## Commands

| Command | Where | What |
|---|---|---|
| `npm run setup` | root | Sync `.env` cameras -> `cameras.yml` -> generated configs |
| `npm run test` | root | Run tests in all workspaces inside containers |
| `npm run dev` | root | Start go2rtc + server + web-app (Vite) in Docker |
| `npm run prod` | root | Production stack: nginx + server + go2rtc |
| `npm run prod:down` | root | Stop the production stack |
| `docker compose logs go2rtc --since 5m` | root | Debug camera connections |

## Project structure

```
├── .env.example          # secrets template (copy to .env — never committed)
├── cameras.yml           # single source of truth (managed by npm run setup)
├── docker-compose.yml        # dev: go2rtc + server + Vite
├── docker-compose.prod.yml   # prod: go2rtc + server + nginx
├── nginx/                    # production reverse proxy + static UI image
├── cameras-setup/        # config sync/generate tooling (TypeScript, vitest)
├── go2rtc/go2rtc.yaml    # GENERATED — go2rtc config (${VAR} placeholders only)
├── server/               # Node/Express API + RecorderManager + SQLite
└── web-app/              # React client (Vite + Tailwind)
    ├── public/cameras.json   # GENERATED — [{ id, name }] for the grid
    └── src/
        ├── components/   # LiveGrid, CameraTile, VideoStream, TabBar, TileOverlay
        ├── hooks/        # useCameras, useRecorderStatus
        └── lib/go2rtc.ts # go2rtc URLs + web component loader
```

## Roadmap

- **Phase 1 — live grid** (done): live view, mobile-first UI, docker-compose
- **Phase 2 — record** (done): 24/7 recording to disk, snapshots, status badges
- **Phase 3 — timeline** (in progress): playback UI, retention, production deploy via `npm run prod`
- **Phase 4 — detection**: motion events
- **Phase 5 — settings**: camera controls (night vision, quality)

Design docs live in `docs/` (`plans/` and `specs/`).

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
