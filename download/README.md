# Production install (quick start)

Install with **Docker only** — no Node.js, no git clone. Download
`docker-compose.yml` and `example.env`, configure `.env`, pull images, and run.

## Requirements

- Docker Engine + Docker Compose v2
- Disk space for `RECORDINGS_LOCATION`
- Cameras with RTSP/RTSPS reachable from the server

## Step 1 — Install directory

```bash
mkdir camera-dashboard
cd camera-dashboard
```

Download the bundle (use a [release tag](https://github.com/jorcalle11/camera-dashboard/releases) when available):

```bash
curl -fsSL -o docker-compose.yml \
  https://github.com/jorcalle11/camera-dashboard/releases/latest/download/docker-compose.yml

curl -fsSL -o example.env \
  https://github.com/jorcalle11/camera-dashboard/releases/latest/download/example.env
```

Until the first GitHub Release is published, use raw files from `main`:

```bash
curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/jorcalle11/camera-dashboard/main/download/docker-compose.yml

curl -fsSL -o example.env \
  https://raw.githubusercontent.com/jorcalle11/camera-dashboard/main/download/example.env
```

## Step 2 — Configure `.env`

```bash
cp example.env .env
```

Edit `.env` — at minimum:

| Variable | Purpose |
|----------|---------|
| `CAM1_RTSP_URL`, … | Camera URLs ([Wyze `ffmpeg:` wrapper](https://github.com/jorcalle11/camera-dashboard/blob/main/README.md#camera-url-format)) |
| `HOST_IP` | Server LAN IP for WebRTC |
| `WEB_UI_PORT` | Browser port for the dashboard |
| `RECORDINGS_LOCATION` / `DATA_LOCATION` | Host paths for footage and SQLite |
| Port and container-path vars | See comments in `example.env` |

Re-run Step 3 after changing `GO2RTC_*` ports or cameras.

## Step 3 — Generate config files

Creates `cameras.yml` and `go2rtc/go2rtc.yaml` in this directory:

```bash
docker compose pull cameras-setup
docker compose --profile setup run --rm cameras-setup
```

## Step 4 — Start

```bash
docker compose pull
docker compose up -d
```

Open **`http://<server-ip>:<WEB_UI_PORT>`**.

## Verify

```bash
curl -fsS "http://127.0.0.1:${WEB_UI_PORT}/api/health"
```

## Updates

```bash
docker compose pull && docker compose up -d
```

Each published release retags `latest` on GHCR; pulling always picks up the current build.

## Backups

SQLite lives under `DATA_LOCATION`; MP4s under `RECORDINGS_LOCATION`. Back up both
host paths — the database alone is not enough to restore footage.

## Remote access

Prefer [Tailscale](https://tailscale.com). Do not expose go2rtc or the API on the
public internet without auth in front.

## Troubleshooting

- **Image pull fails:** confirm GHCR packages are public and a release has been published
  (see [GitHub Releases](https://github.com/jorcalle11/camera-dashboard/releases)).
- **No cameras:** re-run Step 3, then `docker compose up -d --force-recreate go2rtc server`.
- **Phone live view broken:** fix `HOST_IP`, re-run Step 3 if ports changed, then
  `docker compose up -d --force-recreate go2rtc`.

---

## For maintainers (publishing)

Every merge to `main` automatically bumps the patch semver (e.g. `v0.1.3` →
`v0.1.4`), builds server/nginx/cameras-setup images to GHCR, retags `latest`, and
creates a GitHub Release with `download/docker-compose.yml` + `download/example.env`
attached. See `.github/workflows/release.yml`.

To skip a release, tag the commit before merging or push a commit that already has
an exact tag.

Development (Vite, local builds) uses the repo root `docker-compose.yml` — not this folder.
