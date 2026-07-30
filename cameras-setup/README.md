# cameras-setup

Config sync/generate tooling. Turns `.env` camera definitions into the
generated config files, keeping `cameras.yml` as the single source of truth.

## What it does

Running `npm run setup` (or the `cameras-setup` compose service) does two
passes:

1. **sync** — scans `.env` for numbered `CAMn_RTSP_URL` variables and updates
   `cameras.yml`: new cameras are added (`camN` / "Camera N"), removed ones are
   dropped. Manual edits to `name`, `enabled`, and `retention_days` are
   preserved. URLs are stored as `${CAMn_RTSP_URL}` placeholders — never
   credentials.
2. **generate** — renders from `cameras.yml`:
   - `go2rtc/go2rtc.yaml` — go2rtc streams + listeners (placeholders resolved
     by go2rtc at runtime)
   - `web-app/public/cameras.json` — `[{ id, name }]` for the grid (skipped in
     install mode, where nginx serves a prebuilt bundle)

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `CAMn_RTSP_URL` | — | Camera sources (numbered, from `.env`) |
| `INSTALL_ROOT` | unset | Install mode: write configs to this directory instead of the repo, skip `cameras.json` (used by `download/docker-compose.yml`) |
| `GO2RTC_API_PORT` | `1984` | go2rtc API listener |
| `GO2RTC_RTSP_PORT` | `8554` | go2rtc RTSP restream listener |
| `GO2RTC_WEBRTC_PORT` | `8555` | go2rtc WebRTC listener + `${HOST_IP}` candidate |

## Usage

```bash
# Development (repo root)
npm run setup

# Production install (download folder)
docker compose --profile setup run --rm cameras-setup

# Tests
docker compose run --rm cameras-setup npm test
```

## Docker image

`Dockerfile.release` (repo-root build context) is pushed to GHCR as
`camera-dashboard/cameras-setup` by `.github/workflows/release.yml`. In dev,
the service runs from a plain `node:24-alpine` image with the repo mounted.
