# nginx

Production UI image. A multi-stage build compiles the `web-app` bundle
(`vite build`) and serves it with nginx, which also takes over the reverse
proxying that Vite does in development. Used only by the production compose
stack in `download/` — dev uses the Vite server on :5173.

## Routing

| Location | Target |
|---|---|
| `/` | Static web-app bundle (SPA fallback to `index.html`) |
| `/api/statics/recordings/` | MP4 segments served directly from the recordings volume (byte ranges enabled) — bypasses the Node server |
| `/api/` | `server` container (WebSocket-aware, forwards upgrade headers) |
| `/go2rtc/` | `go2rtc` container — rewrites the `Origin` header, since go2rtc rejects WebSocket upgrades whose Origin doesn't match its host |

## Environment

The entrypoint renders `default.conf.template` with `envsubst`; all variables
are **required** (set in `download/docker-compose.yml` from `.env`):

| Variable | Purpose |
|---|---|
| `NGINX_HTTP_PORT` | Listen port inside the container |
| `SERVER_PORT` | Upstream port of the `server` container |
| `GO2RTC_API_PORT` | Upstream port of the `go2rtc` container |
| `RECORDINGS_CONTAINER_PATH` | Mount path of the recordings volume |

## Image

Built from the repo root (`nginx/Dockerfile`, context `..`) and pushed to
GHCR as `camera-dashboard/nginx` by `.github/workflows/release.yml`.
