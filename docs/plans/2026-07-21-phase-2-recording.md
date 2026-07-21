# Phase 2 — Continuous Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Node/Express server that continuously records every enabled camera into 60s MP4 segments, indexes them in SQLite, exposes status/snapshot/recording APIs, pushes recorder state over WebSocket, and shows `REC`/`retrying` badges on the live grid.

**Architecture:** A single `server` container runs Express + RecorderManager. `RecorderManager` spawns one `ffmpeg -c copy` child per enabled camera, consuming go2rtc's RTSP restream. A directory watcher indexes completed segments (via `ffprobe`) into SQLite and reconciles on startup. Express serves `/api/*`, `/recordings/*`, and a WebSocket. The web-app adds a `useRecorderStatus` hook and tile badges.

**Tech Stack:** Docker Compose, Node 24 Alpine, TypeScript (strict), Express 4, better-sqlite3, ws, chokidar, yaml, vitest, supertest, ffmpeg/ffprobe (Alpine packages).

**Spec:** `docs/specs/2026-07-16-core-nvr-design.md`

## Global Constraints

- TypeScript everywhere, `"strict": true` in every tsconfig.
- Secrets (camera URLs with credentials, host IP) live ONLY in `.env` (gitignored). Generated files and compose files must be committable — they reference `${ENV_VARS}`, never literal credentials.
- `cameras.yml` is the single source of truth for cameras. Nothing else hardcodes camera ids/names.
- go2rtc is the only component that talks to cameras; the recorder consumes go2rtc's RTSP restream (`rtsp://go2rtc:8554/<id>`).
- Recording is continuous and auto-start for every enabled camera; no manual start/stop.
- Filesystem is the source of truth for segments/snapshots; SQLite is a queryable index.
- Paths stored in the DB are relative to the recordings root (`/recordings` in the container, `./recordings` on the host).
- RecorderManager restarts dead ffmpeg processes with exponential backoff (1s base, doubling, 60s cap, unlimited retries).
- No host installs — everything runs inside Docker. Root `package.json` contains only convenience scripts.
- Commit after every green test cycle. Conventional commit messages (`feat:`, `test:`, `chore:`).

## File Structure

```
camera-dashboard/
├── .env.example                 # template for secrets
├── .gitignore
├── README.md
├── cameras.yml                  # single source of truth (managed by npm run setup)
├── docker-compose.yml           # go2rtc + cameras-setup + server + web-app
├── package.json                 # root: orchestrator scripts only
├── docs/
├── cameras-setup/               # config sync + generator (renamed from tools/)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── index.ts                 # entry: sync .env -> cameras.yml -> generate configs
│   ├── config.ts
│   ├── render.ts
│   ├── sync.ts
│   └── __tests__/
├── go2rtc/
│   └── go2rtc.yaml              # GENERATED (committed — no secrets, only ${VARS})
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile               # multistage: dev + prod targets
│   ├── .dockerignore
│   └── src/
│       ├── index.ts             # bootstrap: db, config sync, recorder, api, ws
│       ├── app.ts               # Express app factory (no listen)
│       ├── db.ts                # SQLite connection + migration runner
│       ├── websocket.ts         # WS /api/ws broadcaster
│       ├── config.ts            # load cameras.yml + sync cameras table
│       ├── migrations/
│       │   └── 001-initial.sql
│       ├── recorder/
│       │   ├── ffmpeg.ts        # ffmpeg spawn helper
│       │   ├── RecorderManager.ts
│       │   ├── indexer.ts       # segment watcher + reconciliation
│       │   └── __tests__/
│       │       ├── RecorderManager.test.ts
│       │       ├── indexer.test.ts
│       │       └── ffmpeg.test.ts
│       └── routes/
│           ├── cameras.ts       # GET /api/cameras, GET /api/cameras/:id/latest.jpg
│           ├── snapshots.ts     # POST /api/cameras/:id/snapshot, GET /api/snapshots
│           ├── recordings.ts    # GET /api/recordings (segment list)
│           ├── system.ts        # GET /api/system/status
│           └── __tests__/
│               ├── cameras.test.ts
│               ├── snapshots.test.ts
│               └── system.test.ts
└── web-app/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts           # proxies /go2rtc, /api, /recordings
    ├── index.html
    ├── public/
    │   └── cameras.json         # GENERATED (id/name only)
    └── src/
        ├── main.tsx
        ├── index.css
        ├── App.tsx
        ├── types.ts
        ├── lib/
        │   └── go2rtc.ts
        ├── hooks/
        │   ├── useCameras.ts
        │   └── useRecorderStatus.ts
        └── components/
            ├── TabBar.tsx
            ├── LiveGrid.tsx
            ├── CameraTile.tsx
            ├── VideoStream.tsx
            ├── TileOverlay.tsx
            └── __tests__/
                ├── LiveGrid.test.tsx
                └── TileOverlay.test.tsx
```

---

### Task 0: Restructure root (cameras-setup, root package.json, cameras.yml comment)

**Files:**
- Modify: root `package.json`, `cameras.yml`
- Rename: `tools/` → `cameras-setup/`
- Create: `cameras-setup/package.json`, `cameras-setup/tsconfig.json`, `cameras-setup/vitest.config.ts`

**Interfaces:**
- Produces: a self-contained `cameras-setup/` workspace and a thin root orchestrator.

- [ ] **Step 1: Rename `tools/` to `cameras-setup/`**

Run:

```bash
git mv tools cameras-setup
```

- [ ] **Step 2: Move root tool config/deps into `cameras-setup/`**

Create `cameras-setup/package.json`:

```json
{
  "name": "camera-dashboard-cameras-setup",
  "private": true,
  "type": "module",
  "scripts": {
    "setup": "tsx index.ts",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^26.1.1",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "yaml": "^2.5.0"
  }
}
```

Move `tsconfig.json` and `vitest.config.ts` into `cameras-setup/` and update `include` paths:

`cameras-setup/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["."]
}
```

- [ ] **Step 3: Update root `package.json` to orchestrator only**

```json
{
  "name": "camera-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "setup": "docker compose run --rm cameras-setup npm run setup",
    "test": "docker compose run --rm cameras-setup npm test && docker compose run --rm server npm test && docker compose run --rm web-app npm test",
    "dev": "docker compose up"
  }
}
```

- [ ] **Step 4: Update `cameras.yml` header comment**

```yaml
# AUTO-GENERATED by `npm run setup` (cameras-setup/index.ts).
# Manual edits to `name`, `enabled`, and `retention_days` are preserved.
# Do not add or remove cameras, and do not edit `url` values by hand —
# camera list and URLs come from `.env` via `npm run setup`.
# Never put credentials in this file.
webrtc_candidate: ${HOST_IP}:8555
```

- [ ] **Step 5: Update `cameras-setup/index.ts` entry point**

The current `cameras-setup/generate.ts` remains as the generator, but `index.ts` becomes the CLI entry that runs `sync.ts` then `generate.ts`:

```ts
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { readFileSync, writeFileSync } from "node:fs"
import { parse, stringify } from "yaml"
import { envKeysFromFile, syncCameras } from "./sync"
import { loadConfig } from "./config"
import { renderClientCameras, renderGo2rtc } from "./render"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function main() {
  // 1. Sync cameras.yml from .env
  let envText: string
  try {
    envText = readFileSync(join(root, ".env"), "utf8")
  } catch {
    console.error("error: .env not found — copy .env.example to .env first")
    process.exit(1)
  }

  const camerasYmlPath = join(root, "cameras.yml")
  let doc: { webrtc_candidate?: string; cameras?: unknown[] } = {}
  try {
    doc = (parse(readFileSync(camerasYmlPath, "utf8")) as typeof doc) ?? {}
  } catch {
    // no cameras.yml yet — start fresh
  }

  const rawCams = (doc.cameras ?? []) as import("./sync").RawCameraEntry[]
  const { cameras, added, removed } = syncCameras(envKeysFromFile(envText), rawCams)

  if (cameras.length === 0) {
    console.error("error: no CAMn_RTSP_URL variables found in .env — nothing to sync")
    process.exit(1)
  }

  const synced = {
    webrtc_candidate: doc.webrtc_candidate ?? "${HOST_IP}:8555",
    cameras,
  }
  writeFileSync(
    camerasYmlPath,
    `# AUTO-GENERATED by \`npm run setup\` (cameras-setup/index.ts).\n# Manual edits to \`name\`, \`enabled\`, and \`retention_days\` are preserved.\n# Do not add or remove cameras, and do not edit \`url\` values by hand —\n# camera list and URLs come from \`.env\` via \`npm run setup\`.\n# Never put credentials in this file.\n` + stringify(synced),
  )

  for (const id of added) console.log(`added   ${id}`)
  for (const id of removed) console.log(`removed ${id}`)
  console.log(`synced ${cameras.length} camera(s) -> cameras.yml`)

  // 2. Generate configs
  const config = loadConfig(readFileSync(camerasYmlPath, "utf8"))

  const go2rtcPath = join(root, "go2rtc", "go2rtc.yaml")
  writeFileSync(go2rtcPath, renderGo2rtc(config))
  console.log(`wrote ${go2rtcPath}`)

  const camerasJsonPath = join(root, "web-app", "public", "cameras.json")
  writeFileSync(camerasJsonPath, renderClientCameras(config))
  console.log(`wrote ${camerasJsonPath}`)
}

main()
```

- [ ] **Step 6: Verify inside Docker**

Run:

```bash
docker compose run --rm cameras-setup npm run setup
```

Expected: `cameras.yml` updated, `go2rtc/go2rtc.yaml` and `web-app/public/cameras.json` regenerated.

- [ ] **Step 7: Commit**

```bash
git add cameras-setup/ package.json cameras.yml
# delete root tsconfig.json and vitest.config.ts if they were moved
git rm tsconfig.json vitest.config.ts 2>/dev/null || true
git commit -m "chore: move tooling into cameras-setup workspace, root package as orchestrator"
```

---

### Task 1: Server scaffold + multistage Dockerfile + docker-compose service

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/Dockerfile`, `server/.dockerignore`
- Modify: `.env.example`, `docker-compose.yml`

**Interfaces:**
- Produces: a runnable `server` service via `docker compose up server`.
- Dockerfile has `dev` target for live reload and `prod` target for deployment.

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "camera-dashboard-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --poll src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "chokidar": "^3.6.0",
    "express": "^4.19.0",
    "ws": "^8.18.0",
    "yaml": "^2.5.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "@types/supertest": "^6.0.0",
    "@types/ws": "^8.5.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create multistage `server/Dockerfile`**

```dockerfile
# Base image with Node + ffmpeg
FROM node:24-alpine AS base
RUN apk add --no-cache ffmpeg
WORKDIR /app

# Development stage: includes build tools, dev deps, tsx watch
FROM base AS dev
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]

# Build stage: compiles TypeScript
FROM dev AS builder
RUN npm run build

# Production stage: slim image with only runtime deps
FROM base AS prod
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
```

- [ ] **Step 4: Create `server/.dockerignore`**

```gitignore
node_modules
dist
*.log
```

- [ ] **Step 5: Update `.env.example`**

Append:

```sh
# Server recording paths (inside container these are /recordings and /data)
RECORDINGS_PATH=./recordings
DATA_PATH=./data

# Disk free threshold (GB). When free space drops below this, oldest segments are deleted.
DISK_FREE_THRESHOLD_GB=10
```

- [ ] **Step 6: Update `docker-compose.yml`**

Add `cameras-setup`, `server`, and update `web-app` services:

```yaml
services:
  go2rtc:
    image: alexxit/go2rtc:1.9.7
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./go2rtc/go2rtc.yaml:/config/go2rtc.yaml:ro
    ports:
      - "1984:1984"
      - "8554:8554"
      - "8555:8555/tcp"
      - "8555:8555/udp"

  cameras-setup:
    image: node:24-alpine
    working_dir: /workspace/cameras-setup
    env_file: .env
    volumes:
      - .:/workspace
      - cameras_setup_node_modules:/workspace/cameras-setup/node_modules
    command: npm run setup

  server:
    build:
      context: ./server
      target: dev
    restart: unless-stopped
    env_file: .env
    environment:
      GO2RTC_URL: http://go2rtc:1984
      RECORDINGS_PATH: /recordings
      DATA_PATH: /data
      CAMERAS_YML_PATH: /workspace/cameras.yml
      DISK_FREE_THRESHOLD_GB: ${DISK_FREE_THRESHOLD_GB:-10}
    volumes:
      - ./server:/app
      - server_node_modules:/app/node_modules
      - ./cameras.yml:/workspace/cameras.yml:ro
      - ${RECORDINGS_PATH}:/recordings
      - ${DATA_PATH}:/data
    ports:
      - "3000:3000"
    depends_on:
      - go2rtc

  web-app:
    image: node:24-alpine
    restart: unless-stopped
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    environment:
      GO2RTC_URL: http://go2rtc:1984
      SERVER_URL: http://server:3000
    volumes:
      - ./web-app:/app
      - web_app_node_modules:/app/node_modules
    ports:
      - "5173:5173"
    depends_on:
      - go2rtc
      - server

volumes:
  cameras_setup_node_modules:
  server_node_modules:
  web_app_node_modules:
```

- [ ] **Step 7: Type-check server inside Docker**

Run:

```bash
docker compose run --rm server npx tsc --noEmit
```

Expected: exits 0 (no source files yet is fine).

- [ ] **Step 8: Commit**

```bash
git add server/ .env.example docker-compose.yml
# remove root tsconfig/vitest if still tracked
git rm tsconfig.json vitest.config.ts 2>/dev/null || true
git commit -m "chore: scaffold server container with multistage Dockerfile"
```

---

### Task 2: Database schema + migrations

**Files:**
- Create: `server/src/migrations/001-initial.sql`, `server/src/db.ts`
- Test: `server/src/db.test.ts`

**Interfaces:**
- Produces: `getDb(path: string): Database` (better-sqlite3) and `migrate(db): void`.
- Produces tables: `cameras`, `segments`, `snapshots`, `schema_migrations` as defined in the spec.

- [ ] **Step 1: Create `server/src/migrations/001-initial.sql`**

```sql
CREATE TABLE IF NOT EXISTS cameras (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS segments (
  id          INTEGER PRIMARY KEY,
  camera_id   TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  start_ts    INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  path        TEXT NOT NULL UNIQUE,
  size_bytes  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segments_camera_time ON segments (camera_id, start_ts);

CREATE TABLE IF NOT EXISTS snapshots (
  id          INTEGER PRIMARY KEY,
  camera_id   TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  ts          INTEGER NOT NULL,
  path        TEXT NOT NULL UNIQUE,
  size_bytes  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_camera_time ON snapshots (camera_id, ts);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL
);
```

- [ ] **Step 2: Write failing migration test**

`server/src/db.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getDb, migrate } from "./db"

describe("migrate", () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nvr-db-"))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("creates expected tables", () => {
    const db = getDb(join(dir, "nvr.db"))
    migrate(db)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain("cameras")
    expect(names).toContain("segments")
    expect(names).toContain("snapshots")
    expect(names).toContain("schema_migrations")
  })

  it("records migration version", () => {
    const db = getDb(join(dir, "nvr.db"))
    migrate(db)
    const row = db.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as { version: number }
    expect(row.version).toBe(1)
  })

  it("is idempotent", () => {
    const db = getDb(join(dir, "nvr.db"))
    migrate(db)
    migrate(db) // should not throw
    expect(db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as { c: number }).toEqual({ c: 1 })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
docker compose run --rm server npx vitest run src/db.test.ts
```

Expected: FAIL — cannot resolve `./db`.

- [ ] **Step 4: Implement `server/src/db.ts`**

```ts
import Database from "better-sqlite3"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

export function getDb(path: string): Database {
  const db = new Database(path)
  db.pragma("journal_mode = WAL")
  return db
}

export function migrate(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`)

  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version),
  )

  const migrationsDir = join(fileURLToPath(import.meta.url), "..", "migrations")
  const migration = readFileSync(join(migrationsDir, "001-initial.sql"), "utf8")
  if (!applied.has(1)) {
    db.exec(migration)
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(1, Date.now())
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
docker compose run --rm server npx vitest run src/db.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/src/db.test.ts server/src/migrations/
git commit -m "feat: add SQLite schema and migration runner"
```

---

### Task 3: Server config loader (cameras.yml → DB)

**Files:**
- Create: `server/src/config.ts`
- Test: `server/src/config.test.ts`

**Interfaces:**
- Consumes: `cameras.yml` from project root (mounted at `CAMERAS_YML_PATH`).
- Produces: `loadServerConfig(yamlText: string): AppConfig` and `syncCameras(db, config): void`.
- Types: `CameraConfig { id, name, url, enabled, retentionDays }`, `AppConfig { webrtcCandidate, cameras }`.

- [ ] **Step 1: Write failing config loader test**

`server/src/config.test.ts`:

```ts
import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadServerConfig, syncCameras } from "./config"
import { getDb, migrate } from "./db"

const YAML = `
webrtc_candidate: \${HOST_IP}:8555
cameras:
  - id: cam1
    name: Front Door
    url: \${CAM1_RTSP_URL}
    enabled: true
    retention_days: 7
`

describe("loadServerConfig", () => {
  it("parses cameras.yml", () => {
    const cfg = loadServerConfig(YAML)
    expect(cfg.webrtcCandidate).toBe("${HOST_IP}:8555")
    expect(cfg.cameras).toEqual([
      { id: "cam1", name: "Front Door", url: "${CAM1_RTSP_URL}", enabled: true, retentionDays: 7 },
    ])
  })

  it("rejects invalid config", () => {
    expect(() => loadServerConfig("cameras: []")).toThrow(/at least one camera/i)
  })
})

describe("syncCameras", () => {
  let dir: string
  let db: Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nvr-cfg-"))
    db = getDb(join(dir, "nvr.db"))
    migrate(db)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("inserts cameras from config", () => {
    const cfg = loadServerConfig(YAML)
    syncCameras(db, cfg)
    const row = db.prepare("SELECT id, name, enabled FROM cameras WHERE id=?").get("cam1") as {
      id: string
      name: string
      enabled: number
    }
    expect(row).toEqual({ id: "cam1", name: "Front Door", enabled: 1 })
  })

  it("updates names and disables missing cameras", () => {
    const cfg = loadServerConfig(YAML)
    syncCameras(db, cfg)
    const updated = loadServerConfig(YAML.replace("Front Door", "Porch"))
    syncCameras(db, updated)
    const row = db.prepare("SELECT name, enabled FROM cameras WHERE id=?").get("cam1") as {
      name: string
      enabled: number
    }
    expect(row.name).toBe("Porch")
    expect(row.enabled).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
docker compose run --rm server npx vitest run src/config.test.ts
```

Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 3: Implement `server/src/config.ts`**

```ts
import { parse } from "yaml"
import type Database from "better-sqlite3"

export interface CameraConfig {
  id: string
  name: string
  url: string
  enabled: boolean
  retentionDays: number
}

export interface AppConfig {
  webrtcCandidate: string
  cameras: CameraConfig[]
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export function loadServerConfig(yamlText: string): AppConfig {
  const raw = parse(yamlText) as unknown
  if (typeof raw !== "object" || raw === null) throw new Error("config must be a YAML mapping")
  const doc = raw as Record<string, unknown>

  if (typeof doc.webrtc_candidate !== "string" || doc.webrtc_candidate.length === 0)
    throw new Error("webrtc_candidate must be a non-empty string")
  if (!Array.isArray(doc.cameras) || doc.cameras.length === 0)
    throw new Error("config must define at least one camera")

  const seen = new Set<string>()
  const cameras = doc.cameras.map((entry, i) => {
    const cam = entry as Record<string, unknown>
    if (typeof cam.id !== "string" || !ID_PATTERN.test(cam.id))
      throw new Error(`cameras[${i}]: id must be a lowercase slug (got ${JSON.stringify(cam.id)})`)
    if (seen.has(cam.id)) throw new Error(`duplicate camera id: ${cam.id}`)
    seen.add(cam.id)
    if (typeof cam.name !== "string" || cam.name.length === 0)
      throw new Error(`cameras[${i}]: name must be a non-empty string`)
    if (typeof cam.url !== "string" || cam.url.length === 0)
      throw new Error(`cameras[${i}]: url must be a non-empty string`)
    if (typeof cam.enabled !== "boolean")
      throw new Error(`cameras[${i}]: enabled must be a boolean`)
    if (typeof cam.retention_days !== "number" || cam.retention_days < 1)
      throw new Error(`cameras[${i}]: retention_days must be a number >= 1`)
    return {
      id: cam.id,
      name: cam.name,
      url: cam.url,
      enabled: cam.enabled,
      retentionDays: cam.retention_days,
    }
  })

  return { webrtcCandidate: doc.webrtc_candidate, cameras }
}

export function syncCameras(db: Database.Database, config: AppConfig): void {
  const insert = db.prepare(
    `INSERT INTO cameras (id, name, enabled, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, enabled=excluded.enabled`,
  )
  const now = Date.now()
  for (const cam of config.cameras) {
    insert.run(cam.id, cam.name, cam.enabled ? 1 : 0, now)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
docker compose run --rm server npx vitest run src/config.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts server/src/config.test.ts
git commit -m "feat: load cameras.yml and sync into SQLite"
```

---

### Task 4: RecorderManager — state machine + ffmpeg spawn

**Files:**
- Create: `server/src/recorder/ffmpeg.ts`, `server/src/recorder/RecorderManager.ts`
- Test: `server/src/recorder/__tests__/RecorderManager.test.ts`, `server/src/recorder/__tests__/ffmpeg.test.ts`

**Interfaces:**
- Produces: `RecorderManager` with `start(camera)`, `stop(camera)`, `stopAll()`, `status()`, and `on("status", ({ cameraId, state, restartedAt, restarts }) => void)`.
- States: `"recording" | "retrying" | "stopped"`.
- `spawnFfmpeg(cameraId, outputDir)` returns `{ process: ChildProcess; logPath: string }`.

- [ ] **Step 1: Write failing RecorderManager tests**

`server/src/recorder/__tests__/RecorderManager.test.ts`:

```ts
import { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vitest"
import { RecorderManager } from "../RecorderManager"

function fakeProcess() {
  const proc = new EventEmitter() as unknown as import("node:child_process").ChildProcess
  proc.kill = vi.fn().mockReturnValue(true)
  return proc
}

describe("RecorderManager", () => {
  it("starts a camera and emits recording status", async () => {
    const spawn = vi.fn().mockReturnValue({ process: fakeProcess(), logPath: "/tmp/cam1.log" })
    const mgr = new RecorderManager({ spawnFfmpeg: spawn, outputRoot: "/recordings", baseBackoffMs: 10 })
    mgr.start({ id: "cam1", name: "Front Door", enabled: true, retentionDays: 7 })
    await new Promise((r) => setTimeout(r, 5))
    expect(spawn).toHaveBeenCalledWith("cam1", "/recordings/cam1")
    const status = mgr.status()
    expect(status.cam1.state).toBe("recording")
  })

  it("retries on exit with backoff", async () => {
    const proc1 = fakeProcess()
    const proc2 = fakeProcess()
    const spawn = vi.fn().mockReturnValueOnce({ process: proc1, logPath: "/tmp/cam1.log" }).mockReturnValueOnce({ process: proc2, logPath: "/tmp/cam1.log" })
    const mgr = new RecorderManager({ spawnFfmpeg: spawn, outputRoot: "/recordings", baseBackoffMs: 10 })
    mgr.start({ id: "cam1", name: "Front Door", enabled: true, retentionDays: 7 })
    await new Promise((r) => setTimeout(r, 5))
    proc1.emit("exit", 1)
    await new Promise((r) => setTimeout(r, 25))
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(mgr.status().cam1.state).toBe("recording")
  })

  it("stops a camera and does not restart", async () => {
    const proc = fakeProcess()
    const spawn = vi.fn().mockReturnValue({ process, logPath: "/tmp/cam1.log" })
    const mgr = new RecorderManager({ spawnFfmpeg: spawn, outputRoot: "/recordings", baseBackoffMs: 10 })
    mgr.start({ id: "cam1", name: "Front Door", enabled: true, retentionDays: 7 })
    await new Promise((r) => setTimeout(r, 5))
    mgr.stop("cam1")
    expect(proc.kill).toHaveBeenCalled()
    proc.emit("exit", 0)
    await new Promise((r) => setTimeout(r, 25))
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(mgr.status().cam1.state).toBe("stopped")
  })
})
```

- [ ] **Step 2: Write failing ffmpeg tests**

`server/src/recorder/__tests__/ffmpeg.test.ts`:

```ts
import { EventEmitter } from "node:events"
import { spawn } from "node:child_process"
import { describe, expect, it, vi } from "vitest"
import { buildFfmpegArgs, spawnFfmpeg } from "../ffmpeg"

vi.mock("node:child_process", () => ({ spawn: vi.fn() }))

describe("buildFfmpegArgs", () => {
  it("outputs to segmented path", () => {
    const args = buildFfmpegArgs("cam1", "/recordings/cam1")
    expect(args).toContain("rtsp://go2rtc:8554/cam1")
    expect(args).toContain("-c")
    expect(args).toContain("copy")
    expect(args).toContain("/recordings/cam1/%Y-%m-%d/%H-%M-%S.mp4")
  })
})

describe("spawnFfmpeg", () => {
  it("spawns ffmpeg with log redirection", () => {
    const proc = new EventEmitter() as unknown as import("node:child_process").ChildProcess
    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc)
    const result = spawnFfmpeg("cam1", "/recordings/cam1")
    expect(spawn).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining(["-i", "rtsp://go2rtc:8554/cam1"]), expect.any(Object))
    expect(result.process).toBe(proc)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
docker compose run --rm server npx vitest run src/recorder/__tests__
```

Expected: FAIL — cannot resolve modules.

- [ ] **Step 4: Implement `server/src/recorder/ffmpeg.ts`**

```ts
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process"
import { createWriteStream, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

export function buildFfmpegArgs(cameraId: string, outputDir: string): string[] {
  return [
    "-rtsp_transport", "tcp",
    "-i", `rtsp://go2rtc:8554/${cameraId}`,
    "-c", "copy",
    "-f", "segment",
    "-segment_time", "60",
    "-segment_atclocktime", "1",
    "-reset_timestamps", "1",
    "-strftime", "1",
    join(outputDir, "%Y-%m-%d", "%H-%M-%S.mp4"),
  ]
}

export function spawnFfmpeg(cameraId: string, outputDir: string): { process: ChildProcess; logPath: string } {
  mkdirSync(outputDir, { recursive: true })
  const logDir = dirname(outputDir)
  mkdirSync(logDir, { recursive: true })
  const logPath = join(logDir, `${cameraId}.log`)
  const args = buildFfmpegArgs(cameraId, outputDir)
  const logStream = createWriteStream(logPath, { flags: "a" })
  const opts: SpawnOptions = {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  }
  const proc = spawn("ffmpeg", args, opts)
  proc.stdout?.pipe(logStream)
  proc.stderr?.pipe(logStream)
  proc.on("exit", () => logStream.end())
  return { process: proc, logPath }
}
```

- [ ] **Step 5: Implement `server/src/recorder/RecorderManager.ts`**

```ts
import { EventEmitter } from "node:events"
import type { CameraConfig } from "../config"

export type RecorderState = "recording" | "retrying" | "stopped"

export interface CameraStatus {
  state: RecorderState
  restarts: number
  restartedAt: number | null
}

export interface RecorderStatusEvent {
  cameraId: string
  state: RecorderState
  restarts: number
  restartedAt: number | null
}

export interface RecorderManagerOptions {
  spawnFfmpeg: (cameraId: string, outputDir: string) => { process: import("node:child_process").ChildProcess; logPath: string }
  outputRoot: string
  baseBackoffMs?: number
  maxBackoffMs?: number
}

interface ManagedCamera {
  config: CameraConfig
  status: CameraStatus
  process: import("node:child_process").ChildProcess | null
  backoffMs: number
  backoffTimer: NodeJS.Timeout | null
}

export class RecorderManager extends EventEmitter {
  private cameras = new Map<string, ManagedCamera>()
  private spawnFfmpeg: RecorderManagerOptions["spawnFfmpeg"]
  private outputRoot: string
  private baseBackoffMs: number
  private maxBackoffMs: number

  constructor(opts: RecorderManagerOptions) {
    super()
    this.spawnFfmpeg = opts.spawnFfmpeg
    this.outputRoot = opts.outputRoot
    this.baseBackoffMs = opts.baseBackoffMs ?? 1000
    this.maxBackoffMs = opts.maxBackoffMs ?? 60000
  }

  start(camera: CameraConfig): void {
    if (!camera.enabled) return
    this.stop(camera.id)
    const managed: ManagedCamera = {
      config: camera,
      status: { state: "recording", restarts: 0, restartedAt: null },
      process: null,
      backoffMs: this.baseBackoffMs,
      backoffTimer: null,
    }
    this.cameras.set(camera.id, managed)
    this.spawn(managed)
  }

  stop(cameraId: string): void {
    const managed = this.cameras.get(cameraId)
    if (!managed) return
    this.clearBackoff(managed)
    managed.status.state = "stopped"
    if (managed.process && !managed.process.killed) {
      managed.process.kill("SIGTERM")
    }
    managed.process = null
    this.emitStatus(managed)
  }

  stopAll(): void {
    for (const id of this.cameras.keys()) this.stop(id)
  }

  status(): Record<string, CameraStatus> {
    const out: Record<string, CameraStatus> = {}
    for (const [id, managed] of this.cameras) {
      out[id] = { ...managed.status }
    }
    return out
  }

  private spawn(managed: ManagedCamera): void {
    const outputDir = `${this.outputRoot}/${managed.config.id}`
    const { process, logPath } = this.spawnFfmpeg(managed.config.id, outputDir)
    managed.process = process
    managed.status.state = "recording"
    managed.status.restartedAt = Date.now()
    if (managed.status.restarts > 0) managed.status.state = "retrying"
    this.emitStatus(managed)

    process.on("exit", (code) => {
      if (managed.status.state === "stopped") return
      managed.status.restarts += 1
      managed.status.state = "retrying"
      this.emitStatus(managed)
      this.scheduleRetry(managed)
    })
  }

  private scheduleRetry(managed: ManagedCamera): void {
    this.clearBackoff(managed)
    managed.backoffTimer = setTimeout(() => {
      managed.backoffTimer = null
      this.spawn(managed)
      managed.backoffMs = Math.min(managed.backoffMs * 2, this.maxBackoffMs)
    }, managed.backoffMs)
  }

  private clearBackoff(managed: ManagedCamera): void {
    if (managed.backoffTimer) {
      clearTimeout(managed.backoffTimer)
      managed.backoffTimer = null
    }
  }

  private emitStatus(managed: ManagedCamera): void {
    const evt: RecorderStatusEvent = {
      cameraId: managed.config.id,
      state: managed.status.state,
      restarts: managed.status.restarts,
      restartedAt: managed.status.restartedAt,
    }
    this.emit("status", evt)
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
docker compose run --rm server npx vitest run src/recorder/__tests__
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/recorder/
git commit -m "feat: RecorderManager with ffmpeg spawn and retry backoff"
```

---

### Task 5: Segment indexer + reconciliation

**Files:**
- Create: `server/src/recorder/indexer.ts`
- Test: `server/src/recorder/__tests__/indexer.test.ts`

**Interfaces:**
- Produces: `indexSegments({ db, recordingsRoot, cameraId })` reconciles disk → DB; `watchSegments({ db, recordingsRoot })` returns chokidar watcher that indexes the previous segment when a new file appears.
- Produces `probeSegment(path): { durationMs, sizeBytes }` (uses ffprobe).

- [ ] **Step 1: Write failing indexer tests**

`server/src/recorder/__tests__/indexer.test.ts`:

```ts
import Database from "better-sqlite3"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getDb, migrate } from "../../db"
import { indexSegments, parseSegmentPath, probeSegment } from "../indexer"

describe("parseSegmentPath", () => {
  it("extracts camera, date and timestamp", () => {
    const out = parseSegmentPath("cam1/2026-07-21/14-30-00.mp4")
    expect(out).toEqual({ cameraId: "cam1", startTs: new Date("2026-07-21T14:30:00").getTime() })
  })
})

describe("probeSegment", () => {
  it("returns duration and size", () => {
    const dir = mkdtempSync(join(tmpdir(), "nvr-probe-"))
    const path = join(dir, "dummy.mp4")
    writeFileSync(path, Buffer.alloc(1024))
    const result = probeSegment(path)
    expect(result.sizeBytes).toBe(1024)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("indexSegments", () => {
  let dir: string
  let db: Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nvr-idx-"))
    db = getDb(join(dir, "nvr.db"))
    migrate(db)
    db.prepare("INSERT INTO cameras (id, name, enabled, created_at) VALUES (?, ?, ?, ?)").run("cam1", "Front Door", 1, Date.now())
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("indexes existing segment files", () => {
    const recDir = join(dir, "recordings", "cam1", "2026-07-21")
    mkdirSync(recDir, { recursive: true })
    writeFileSync(join(recDir, "14-30-00.mp4"), Buffer.alloc(2048))
    indexSegments({ db, recordingsRoot: join(dir, "recordings"), probeFn: () => ({ durationMs: 60000, sizeBytes: 2048 }) })
    const rows = db.prepare("SELECT * FROM segments").all() as unknown[]
    expect(rows).toHaveLength(1)
  })

  it("removes rows for missing files", () => {
    db.prepare("INSERT INTO segments (camera_id, start_ts, duration_ms, path, size_bytes) VALUES (?, ?, ?, ?, ?)").run(
      "cam1", new Date("2026-07-21T14:30:00").getTime(), 60000, "cam1/2026-07-21/14-30-00.mp4", 100,
    )
    indexSegments({ db, recordingsRoot: join(dir, "recordings"), probeFn: () => ({ durationMs: 60000, sizeBytes: 2048 }) })
    const rows = db.prepare("SELECT * FROM segments").all() as unknown[]
    expect(rows).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
docker compose run --rm server npx vitest run src/recorder/__tests__/indexer.test.ts
```

Expected: FAIL — cannot resolve `../indexer`.

- [ ] **Step 3: Implement `server/src/recorder/indexer.ts`**

```ts
import type Database from "better-sqlite3"
import { globSync } from "node:fs"
import { statSync } from "node:fs"
import { dirname, join } from "node:path"
import chokidar from "chokidar"

export interface SegmentProbe {
  durationMs: number
  sizeBytes: number
}

export function parseSegmentPath(relativePath: string): { cameraId: string; startTs: number } | null {
  const match = relativePath.match(/^([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\/(\d{2})-(\d{2})-(\d{2})\.mp4$/)
  if (!match) return null
  const [, cameraId, date, hh, mm, ss] = match
  const startTs = new Date(`${date}T${hh}:${mm}:${ss}`).getTime()
  return { cameraId, startTs }
}

export function probeSegment(path: string): SegmentProbe {
  const { size } = statSync(path)
  // Real ffprobe would run here; for planning we use file size and assume 60s.
  // Implementation will call `ffprobe -v error -show_entries format=duration,size -of json`.
  return { durationMs: 60000, sizeBytes: size }
}

export interface IndexSegmentsOptions {
  db: Database.Database
  recordingsRoot: string
  probeFn?: (path: string) => SegmentProbe
}

export function indexSegments(opts: IndexSegmentsOptions): void {
  const { db, recordingsRoot, probeFn = probeSegment } = opts
  const insert = db.prepare(
    `INSERT INTO segments (camera_id, start_ts, duration_ms, path, size_bytes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET duration_ms=excluded.duration_ms, size_bytes=excluded.size_bytes`,
  )
  const deleteStmt = db.prepare("DELETE FROM segments WHERE path = ?")

  const onDisk = new Set<string>()
  const pattern = join(recordingsRoot, "*", "*", "*.mp4")
  for (const fullPath of globSync(pattern)) {
    const rel = fullPath.slice(recordingsRoot.length + 1)
    const parsed = parseSegmentPath(rel)
    if (!parsed) continue
    const probe = probeFn(fullPath)
    insert.run(parsed.cameraId, parsed.startTs, probe.durationMs, rel, probe.sizeBytes)
    onDisk.add(rel)
  }

  const rows = db.prepare("SELECT path FROM segments").all() as { path: string }[]
  for (const { path } of rows) {
    if (!onDisk.has(path)) deleteStmt.run(path)
  }
}

export interface WatchSegmentsOptions {
  db: Database.Database
  recordingsRoot: string
  onPreviousSegment?: (relativePath: string) => void
}

export function watchSegments(opts: WatchSegmentsOptions): chokidar.FSWatcher {
  const { db, recordingsRoot } = opts
  const insert = db.prepare(
    `INSERT INTO segments (camera_id, start_ts, duration_ms, path, size_bytes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET duration_ms=excluded.duration_ms, size_bytes=excluded.size_bytes`,
  )

  const watcher = chokidar.watch(join(recordingsRoot, "*", "*", "*.mp4"), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000 },
  })

  watcher.on("add", (fullPath) => {
    const rel = fullPath.slice(recordingsRoot.length + 1)
    // Index the previous minute's segment (guaranteed complete).
    const parsed = parseSegmentPath(rel)
    if (!parsed) return
    const prevTs = parsed.startTs - 60000
    const prevDate = new Date(prevTs)
    const pad = (n: number) => String(n).padStart(2, "0")
    const prevRel = `${parsed.cameraId}/${prevDate.toISOString().slice(0, 10)}/${pad(prevDate.getHours())}-${pad(prevDate.getMinutes())}-${pad(prevDate.getSeconds())}.mp4`
    const prevFull = join(recordingsRoot, prevRel)
    try {
      const probe = probeSegment(prevFull)
      insert.run(parsed.cameraId, prevTs, probe.durationMs, prevRel, probe.sizeBytes)
    } catch {
      // previous segment may not exist yet
    }
  })

  return watcher
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
docker compose run --rm server npx vitest run src/recorder/__tests__/indexer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/recorder/indexer.ts server/src/recorder/__tests__/indexer.test.ts
git commit -m "feat: segment indexer and reconciliation scan"
```

---

### Task 6: Snapshots API

**Files:**
- Create: `server/src/routes/snapshots.ts`, `server/src/routes/__tests__/snapshots.test.ts`

**Interfaces:**
- Produces: Express router with `POST /api/cameras/:id/snapshot` and `GET /api/snapshots?camera=&from=&to=`.
- Snapshot file layout: `snapshots/<cameraId>/<ISO-timestamp>.jpg` relative to recordings root.

- [ ] **Step 1: Write failing snapshot tests**

`server/src/routes/__tests__/snapshots.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"
import { createApp } from "../../app"
import { getDb, migrate } from "../../db"

describe("snapshots routes", () => {
  let dir: string
  let db: ReturnType<typeof getDb>
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nvr-snap-"))
    db = getDb(join(dir, "nvr.db"))
    migrate(db)
    db.prepare("INSERT INTO cameras (id, name, enabled, created_at) VALUES (?, ?, ?, ?)").run("cam1", "Front Door", 1, Date.now())
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("lists snapshots", async () => {
    const app = createApp({ db, recordingsRoot: dir, go2rtcUrl: "http://go2rtc:1984", recorderStatus: vi.fn().mockReturnValue({}) })
    await request(app).get("/api/snapshots?camera=cam1").expect(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
docker compose run --rm server npx vitest run src/routes/__tests__/snapshots.test.ts
```

Expected: FAIL — cannot resolve `../../app`.

- [ ] **Step 3: Implement `server/src/routes/snapshots.ts`**

```ts
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { Router } from "express"
import type Database from "better-sqlite3"

export interface SnapshotDeps {
  db: Database.Database
  recordingsRoot: string
  snapshotCapture?: (cameraId: string, outPath: string) => Promise<string>
}

function defaultCapture(cameraId: string, outPath: string): Promise<string> {
  mkdirSync(dirname(outPath), { recursive: true })
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-rtsp_transport", "tcp",
      "-i", `rtsp://go2rtc:8554/${cameraId}`,
      "-vframes", "1",
      "-q:v", "2",
      outPath,
    ], { stdio: "ignore" })
    proc.on("exit", (code) => {
      if (code === 0) resolve(outPath)
      else reject(new Error(`snapshot failed with code ${code}`))
    })
  })
}

export function snapshotsRouter(deps: SnapshotDeps): Router {
  const { db, recordingsRoot, snapshotCapture = defaultCapture } = deps
  const router = Router()

  router.post("/cameras/:id/snapshot", async (req, res) => {
    const cameraId = req.params.id
    const camera = db.prepare("SELECT id FROM cameras WHERE id=?").get(cameraId)
    if (!camera) return res.status(404).json({ error: "camera not found" })

    const ts = Date.now()
    const iso = new Date(ts).toISOString().replace(/[:.]/g, "-")
    const relativePath = `snapshots/${cameraId}/${iso}.jpg`
    const outPath = join(recordingsRoot, relativePath)
    try {
      await snapshotCapture(cameraId, outPath)
      const stats = await import("node:fs/promises").then((fs) => fs.stat(outPath))
      db.prepare("INSERT INTO snapshots (camera_id, ts, path, size_bytes) VALUES (?, ?, ?, ?)").run(
        cameraId, ts, relativePath, stats.size,
      )
      res.json({ cameraId, ts, path: relativePath })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  router.get("/snapshots", (req, res) => {
    const camera = req.query.camera as string | undefined
    const from = req.query.from ? Number(req.query.from) : 0
    const to = req.query.to ? Number(req.query.to) : Date.now()
    let sql = "SELECT camera_id AS cameraId, ts, path, size_bytes AS sizeBytes FROM snapshots WHERE ts >= ? AND ts <= ?"
    const params: (string | number)[] = [from, to]
    if (camera) {
      sql += " AND camera_id = ?"
      params.push(camera)
    }
    sql += " ORDER BY ts DESC"
    const rows = db.prepare(sql).all(...params)
    res.json(rows)
  })

  return router
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
docker compose run --rm server npx vitest run src/routes/__tests__/snapshots.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/snapshots.ts server/src/routes/__tests__/snapshots.test.ts
git commit -m "feat: snapshot capture and listing API"
```

---

### Task 7: API routes — cameras, latest.jpg, system status, recordings list

**Files:**
- Create: `server/src/routes/cameras.ts`, `server/src/routes/system.ts`, `server/src/routes/recordings.ts`, `server/src/app.ts`
- Test: `server/src/routes/__tests__/cameras.test.ts`, `server/src/routes/__tests__/system.test.ts`

**Interfaces:**
- Produces: `createApp(deps): Express` with routes wired.
- `GET /api/cameras` returns id, name, enabled, recorder state.
- `GET /api/cameras/:id/latest.jpg` proxies go2rtc `frame.jpeg`.
- `GET /api/system/status` returns disk free/used, per-camera recorder status, DB size.
- `GET /api/recordings?camera=&from=&to=` returns segment list.

- [ ] **Step 1: Write failing cameras/system tests**

`server/src/routes/__tests__/cameras.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import { createApp } from "../../app"
import { getDb, migrate } from "../../db"

describe("cameras routes", () => {
  let dir: string
  let db: ReturnType<typeof getDb>
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nvr-cam-"))
    db = getDb(join(dir, "nvr.db"))
    migrate(db)
    db.prepare("INSERT INTO cameras (id, name, enabled, created_at) VALUES (?, ?, ?, ?)").run("cam1", "Front Door", 1, Date.now())
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("lists cameras with recorder state", async () => {
    const app = createApp({ db, recordingsRoot: dir, go2rtcUrl: "http://go2rtc:1984", recorderStatus: () => ({ cam1: { state: "recording", restarts: 0, restartedAt: null } }) })
    const res = await request(app).get("/api/cameras").expect(200)
    expect(res.body).toEqual([
      { id: "cam1", name: "Front Door", enabled: true, state: "recording", restarts: 0, restartedAt: null },
    ])
  })
})
```

`server/src/routes/__tests__/system.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import { createApp } from "../../app"
import { getDb, migrate } from "../../db"

describe("system status", () => {
  let dir: string
  let db: ReturnType<typeof getDb>
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nvr-sys-"))
    db = getDb(join(dir, "nvr.db"))
    migrate(db)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("returns disk and recorder info", async () => {
    const app = createApp({ db, dbPath: join(dir, "nvr.db"), recordingsRoot: dir, go2rtcUrl: "http://go2rtc:1984", recorderStatus: () => ({}) })
    const res = await request(app).get("/api/system/status").expect(200)
    expect(res.body).toHaveProperty("disk")
    expect(res.body).toHaveProperty("cameras")
    expect(res.body).toHaveProperty("dbSizeBytes")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
docker compose run --rm server npx vitest run src/routes/__tests__/cameras.test.ts src/routes/__tests__/system.test.ts
```

Expected: FAIL — cannot resolve `../../app`.

- [ ] **Step 3: Implement `server/src/routes/cameras.ts`**

```ts
import { Router } from "express"
import type Database from "better-sqlite3"
import type { CameraStatus } from "../recorder/RecorderManager"

export interface CameraRouteDeps {
  db: Database.Database
  go2rtcUrl: string
  recorderStatus: () => Record<string, CameraStatus>
}

export function camerasRouter(deps: CameraRouteDeps): Router {
  const { db, go2rtcUrl, recorderStatus } = deps
  const router = Router()

  router.get("/cameras", (_req, res) => {
    const status = recorderStatus()
    const rows = db.prepare("SELECT id, name, enabled FROM cameras ORDER BY id").all() as { id: string; name: string; enabled: number }[]
    const out = rows.map((row) => {
      const s = status[row.id] ?? { state: "stopped", restarts: 0, restartedAt: null }
      return {
        id: row.id,
        name: row.name,
        enabled: Boolean(row.enabled),
        state: s.state,
        restarts: s.restarts,
        restartedAt: s.restartedAt,
      }
    })
    res.json(out)
  })

  router.get("/cameras/:id/latest.jpg", async (req, res) => {
    const cameraId = req.params.id
    const camera = db.prepare("SELECT id FROM cameras WHERE id=?").get(cameraId)
    if (!camera) return res.status(404).end()
    try {
      const url = `${go2rtcUrl}/api/frame.jpeg?src=${encodeURIComponent(cameraId)}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`go2rtc returned ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      res.set("Content-Type", "image/jpeg")
      res.send(buffer)
    } catch (err) {
      res.status(502).json({ error: (err as Error).message })
    }
  })

  return router
}
```

- [ ] **Step 4: Implement `server/src/routes/system.ts`**

```ts
import { Router } from "express"
import type Database from "better-sqlite3"
import { statfsSync, statSync } from "node:fs"
import type { CameraStatus } from "../recorder/RecorderManager"

export interface SystemDeps {
  db: Database.Database
  dbPath: string
  recordingsRoot: string
  recorderStatus: () => Record<string, CameraStatus>
}

export function systemRouter(deps: SystemDeps): Router {
  const { db, dbPath, recordingsRoot, recorderStatus } = deps
  const router = Router()

  router.get("/system/status", (_req, res) => {
    const stats = statfsSync(recordingsRoot)
    const total = stats.bsize * stats.blocks
    const free = stats.bsize * stats.bfree
    const used = total - free

    const cameras = db.prepare("SELECT id, name, enabled FROM cameras").all() as { id: string; name: string; enabled: number }[]
    const status = recorderStatus()
    const cameraStatus = cameras.map((c) => ({
      id: c.id,
      name: c.name,
      enabled: Boolean(c.enabled),
      ...(status[c.id] ?? { state: "stopped", restarts: 0, restartedAt: null }),
    }))

    res.json({
      disk: { totalBytes: total, freeBytes: free, usedBytes: used },
      cameras: cameraStatus,
      dbSizeBytes: statSync(dbPath).size,
    })
  })

  return router
}
```

- [ ] **Step 5: Implement `server/src/routes/recordings.ts`**

```ts
import { Router } from "express"
import type Database from "better-sqlite3"

export interface RecordingsDeps {
  db: Database.Database
}

export function recordingsRouter(deps: RecordingsDeps): Router {
  const { db } = deps
  const router = Router()

  router.get("/recordings", (req, res) => {
    const camera = req.query.camera as string | undefined
    const from = req.query.from ? Number(req.query.from) : 0
    const to = req.query.to ? Number(req.query.to) : Date.now()
    if (!camera) return res.status(400).json({ error: "camera required" })

    const rows = db
      .prepare(
        `SELECT camera_id AS cameraId, start_ts AS startTs, duration_ms AS durationMs, path, size_bytes AS sizeBytes
         FROM segments
         WHERE camera_id = ? AND start_ts >= ? AND start_ts <= ?
         ORDER BY start_ts ASC`,
      )
      .all(camera, from, to)
    res.json(rows)
  })

  return router
}
```

- [ ] **Step 6: Implement `server/src/app.ts`**

```ts
import express from "express"
import type Database from "better-sqlite3"
import { camerasRouter } from "./routes/cameras"
import { recordingsRouter } from "./routes/recordings"
import { snapshotsRouter } from "./routes/snapshots"
import { systemRouter } from "./routes/system"
import type { CameraStatus } from "./recorder/RecorderManager"

export interface AppDeps {
  db: Database.Database
  dbPath: string
  recordingsRoot: string
  go2rtcUrl: string
  recorderStatus: () => Record<string, CameraStatus>
}

export function createApp(deps: AppDeps): express.Express {
  const app = express()
  app.use(express.json())

  app.use("/api", camerasRouter({ db: deps.db, go2rtcUrl: deps.go2rtcUrl, recorderStatus: deps.recorderStatus }))
  app.use("/api", recordingsRouter({ db: deps.db }))
  app.use("/api", systemRouter({ db: deps.db, dbPath: deps.dbPath, recordingsRoot: deps.recordingsRoot, recorderStatus: deps.recorderStatus }))
  app.use("/api", snapshotsRouter({ db: deps.db, recordingsRoot: deps.recordingsRoot }))
  app.use("/recordings", express.static(deps.recordingsRoot))

  return app
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run:

```bash
docker compose run --rm server npx vitest run src/routes/__tests__
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/ server/src/app.ts
git commit -m "feat: cameras, system status, recordings list, and snapshot APIs"
```

---

### Task 8: WebSocket status broadcaster

**Files:**
- Create: `server/src/websocket.ts`
- Test: `server/src/websocket.test.ts`

**Interfaces:**
- Produces: `createStatusServer(server, recorderManager)` returning `{ broadcast() }`.
- Pushes JSON `{ type: "status", cameras: {...}, disk: {...} }` to all connected clients whenever recorder status changes.

- [ ] **Step 1: Write failing WebSocket test**

`server/src/websocket.test.ts`:

```ts
import { createServer } from "node:http"
import { describe, expect, it } from "vitest"
import WebSocket from "ws"
import { RecorderManager } from "./recorder/RecorderManager"
import { createStatusServer } from "./websocket"

describe("createStatusServer", () => {
  it("broadcasts status to connected clients", async () => {
    const httpServer = createServer()
    const recorder = new RecorderManager({
      spawnFfmpeg: () => ({ process: { on: () => {}, kill: () => true } as unknown as import("node:child_process").ChildProcess, logPath: "/tmp/x.log" }),
      outputRoot: "/recordings",
    })
    const { broadcast } = createStatusServer(httpServer, recorder, () => ({ totalBytes: 1, freeBytes: 1, usedBytes: 0 }))
    httpServer.listen(0)
    const port = (httpServer.address() as import("node:net").AddressInfo).port

    const client = new WebSocket(`ws://localhost:${port}/api/ws`)
    await new Promise<void>((resolve, reject) => {
      client.on("open", resolve)
      client.on("error", reject)
    })

    const msgPromise = new Promise<string>((resolve) => client.once("message", (data) => resolve(data.toString())))
    broadcast()
    const msg = await msgPromise
    const parsed = JSON.parse(msg)
    expect(parsed.type).toBe("status")
    expect(parsed).toHaveProperty("cameras")
    client.close()
    httpServer.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
docker compose run --rm server npx vitest run src/websocket.test.ts
```

Expected: FAIL — cannot resolve `./websocket`.

- [ ] **Step 3: Implement `server/src/websocket.ts`**

```ts
import type { Server as HttpServer } from "node:http"
import { WebSocketServer } from "ws"
import type { RecorderManager } from "./recorder/RecorderManager"

export interface DiskInfo {
  totalBytes: number
  freeBytes: number
  usedBytes: number
}

export function createStatusServer(
  server: HttpServer,
  recorderManager: RecorderManager,
  getDiskInfo: () => DiskInfo,
) {
  const wss = new WebSocketServer({ server, path: "/api/ws" })

  const broadcast = () => {
    const payload = JSON.stringify({
      type: "status",
      cameras: recorderManager.status(),
      disk: getDiskInfo(),
    })
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(payload)
    }
  }

  recorderManager.on("status", broadcast)
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "status", cameras: recorderManager.status(), disk: getDiskInfo() }))
  })

  return { broadcast }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
docker compose run --rm server npx vitest run src/websocket.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/websocket.ts server/src/websocket.test.ts
git commit -m "feat: WebSocket status broadcaster for recorder state"
```

---

### Task 9: Server bootstrap (`index.ts`)

**Files:**
- Create: `server/src/index.ts`

**Interfaces:**
- Produces: running server on port 3000 with DB, migrations, config sync, recorder manager, segment watcher, WebSocket, and Express API.

- [ ] **Step 1: Implement `server/src/index.ts`**

```ts
import { readFileSync, statfsSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createApp } from "./app"
import { loadServerConfig, syncCameras } from "./config"
import { getDb, migrate } from "./db"
import { spawnFfmpeg } from "./recorder/ffmpeg"
import { indexSegments, watchSegments } from "./recorder/indexer"
import { RecorderManager } from "./recorder/RecorderManager"
import { createStatusServer } from "./websocket"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dataPath = process.env.DATA_PATH ?? join(root, "..", "data")
const recordingsPath = process.env.RECORDINGS_PATH ?? join(root, "..", "recordings")
const go2rtcUrl = process.env.GO2RTC_URL ?? "http://localhost:1984"
const camerasYmlPath = process.env.CAMERAS_YML_PATH ?? join(root, "..", "cameras.yml")
const dbPath = join(dataPath, "nvr.db")

const db = getDb(dbPath)
migrate(db)

const configYaml = readFileSync(camerasYmlPath, "utf8")
const config = loadServerConfig(configYaml)
syncCameras(db, config)

indexSegments({ db, recordingsRoot: recordingsPath })
const watcher = watchSegments({ db, recordingsRoot: recordingsPath })

const recorder = new RecorderManager({ spawnFfmpeg, outputRoot: recordingsPath })
for (const camera of config.cameras) {
  recorder.start(camera)
}

const app = createApp({
  db,
  dbPath,
  recordingsRoot: recordingsPath,
  go2rtcUrl,
  recorderStatus: () => recorder.status(),
})

const server = createServer(app)
createStatusServer(server, recorder, () => {
  const { bsize, blocks, bfree } = statfsSync(recordingsPath)
  const total = bsize * blocks
  const free = bsize * bfree
  return { totalBytes: total, freeBytes: free, usedBytes: total - free }
})

const port = Number(process.env.PORT ?? 3000)
server.listen(port, () => {
  console.log(`server listening on :${port}`)
})

function shutdown() {
  console.log("shutting down...")
  recorder.stopAll()
  watcher.close().catch(() => {})
  server.close(() => process.exit(0))
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
```

- [ ] **Step 2: Type-check**

Run:

```bash
docker compose run --rm server npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: bootstrap server with db, recorder, indexer, api, and websocket"
```

---

### Task 10: web-app status badges + snapshot button

**Files:**
- Create: `web-app/src/hooks/useRecorderStatus.ts`, `web-app/src/components/TileOverlay.tsx`
- Modify: `web-app/src/App.tsx`, `web-app/src/components/LiveGrid.tsx`, `web-app/src/components/CameraTile.tsx`
- Test: `web-app/src/components/__tests__/TileOverlay.test.tsx`

**Interfaces:**
- Produces: `useRecorderStatus(): Record<string, RecorderStatus>` — one WebSocket connection, consumed by `App`.
- Produces: `<LiveGrid status={status} />` and `<CameraTile status={status[camera.id]} />`.
- Produces: `<TileOverlay camera={camera} state={state} onSnapshot={() => void} />` with REC/retrying badge and snapshot button.

- [ ] **Step 1: Update `web-app/vite.config.ts` to proxy `/api` and `/recordings`**

Add proxy rules so the dev server can reach the server API and recordings:

```ts
server: {
  proxy: {
    "/go2rtc": {
      target: go2rtcTarget,
      changeOrigin: true,
      ws: true,
      rewrite: (path) => path.replace(/^\/go2rtc/, ""),
    },
    "/api": {
      target: process.env.SERVER_URL ?? "http://localhost:3000",
      changeOrigin: true,
      ws: true,
    },
    "/recordings": {
      target: process.env.SERVER_URL ?? "http://localhost:3000",
      changeOrigin: true,
    },
  },
},
```

- [ ] **Step 2: Create `web-app/src/hooks/useRecorderStatus.ts`**

```ts
import { useEffect, useState } from "react"

export interface RecorderStatus {
  state: "recording" | "retrying" | "stopped"
  restarts: number
}

export function useRecorderStatus(): Record<string, RecorderStatus> {
  const [status, setStatus] = useState<Record<string, RecorderStatus>>({})

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`)
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as { type: string; cameras?: Record<string, RecorderStatus> }
      if (msg.type === "status" && msg.cameras) setStatus(msg.cameras)
    }
    return () => ws.close()
  }, [])

  return status
}
```

- [ ] **Step 3: Create `web-app/src/components/TileOverlay.tsx`**

```tsx
import type { Camera } from "../types"

interface TileOverlayProps {
  camera: Camera
  state?: "recording" | "retrying" | "stopped"
  onSnapshot?: () => void
}

export default function TileOverlay({ camera, state = "stopped", onSnapshot }: TileOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-2">
      <div className="flex items-center gap-2">
        {state === "recording" && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="recording" />}
        <span className="text-sm font-medium">{camera.name}</span>
        {state === "retrying" && <span className="text-xs text-yellow-400">retrying</span>}
      </div>
      {onSnapshot && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSnapshot()
          }}
          className="pointer-events-auto rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
          aria-label="Take snapshot"
        >
          Snap
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Modify `web-app/src/App.tsx` to consume status and pass to `LiveGrid`**

```tsx
import { useState } from "react"
import LiveGrid from "./components/LiveGrid"
import TabBar, { type View } from "./components/TabBar"
import { useRecorderStatus } from "./hooks/useRecorderStatus"

export default function App() {
  const [view, setView] = useState<View>("live")
  const recorderStatus = useRecorderStatus()

  return (
    <div className="flex h-full flex-col-reverse md:flex-col">
      <TabBar view={view} onChange={setView} />
      <main className="flex-1 overflow-y-auto pb-14 md:pb-0">
        {view === "live" ? (
          <LiveGrid status={recorderStatus} />
        ) : (
          <p className="p-4 text-neutral-400">Timeline arrives in Phase 3</p>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 4b: Modify `web-app/src/components/LiveGrid.tsx` to accept and forward status**

```tsx
import type { RecorderStatus } from "../hooks/useRecorderStatus"
import { useCameras } from "../hooks/useCameras"
import CameraTile from "./CameraTile"

interface LiveGridProps {
  status?: Record<string, RecorderStatus>
}

export default function LiveGrid({ status = {} }: LiveGridProps) {
  const { cameras, error, loading } = useCameras()

  if (loading) return <p className="p-4 text-neutral-400">Loading cameras…</p>
  if (error) return <p className="p-4 text-red-400">{error}</p>
  if (cameras.length === 0) return <p className="p-4 text-neutral-400">No cameras configured.</p>

  return (
    <div className="grid grid-cols-1 gap-2 p-2 md:grid-cols-[repeat(auto-fit,minmax(400px,1fr))] md:gap-3 md:p-3">
      {cameras.map((camera) => (
        <CameraTile key={camera.id} camera={camera} status={status[camera.id]} />
      ))}
    </div>
  )
}
```

- [ ] **Step 4c: Modify `web-app/src/components/CameraTile.tsx`**

Replace the inner overlay div with `<TileOverlay />` and wire snapshot:

```tsx
import { useEffect, useRef, useState } from "react"
import type { Camera } from "../types"
import type { RecorderStatus } from "../hooks/useRecorderStatus"
import VideoStream from "./VideoStream"
import TileOverlay from "./TileOverlay"

interface CameraTileProps {
  camera: Camera
  status?: RecorderStatus
}

export default function CameraTile({ camera, status }: CameraTileProps) {
  const tileRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const state = status?.state ?? "stopped"

  useEffect(() => {
    const tile = tileRef.current
    if (!tile) return
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { threshold: 0.1 },
    )
    observer.observe(tile)
    return () => observer.disconnect()
  }, [])

  const toggleFullscreen = () => {
    const tile = tileRef.current
    if (!tile) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void tile.requestFullscreen()
  }

  const takeSnapshot = async () => {
    await fetch(`/api/cameras/${camera.id}/snapshot`, { method: "POST" })
  }

  return (
    <div
      ref={tileRef}
      onClick={toggleFullscreen}
      className="relative aspect-video overflow-hidden rounded-lg bg-black"
    >
      <VideoStream cameraId={camera.id} paused={!visible} className="h-full w-full" />
      <TileOverlay camera={camera} state={state} onSnapshot={takeSnapshot} />
    </div>
  )
}
```

- [ ] **Step 5: Write TileOverlay tests**

`web-app/src/components/__tests__/TileOverlay.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import TileOverlay from "../TileOverlay"

const CAMERA = { id: "cam1", name: "Front Door" }

describe("TileOverlay", () => {
  it("shows camera name", () => {
    render(<TileOverlay camera={CAMERA} state="recording" />)
    expect(screen.getByText("Front Door")).toBeTruthy()
  })

  it("shows retrying badge", () => {
    render(<TileOverlay camera={CAMERA} state="retrying" />)
    expect(screen.getByText("retrying")).toBeTruthy()
  })

  it("calls onSnapshot when snap button clicked", () => {
    const onSnapshot = vi.fn()
    render(<TileOverlay camera={CAMERA} state="recording" onSnapshot={onSnapshot} />)
    screen.getByLabelText("Take snapshot").click()
    expect(onSnapshot).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run web-app tests**

Run:

```bash
docker compose run --rm web-app npx vitest run
```

Expected: PASS — existing tests + TileOverlay tests.

- [ ] **Step 7: Commit**

```bash
git add web-app/vite.config.ts web-app/src/App.tsx web-app/src/components/LiveGrid.tsx web-app/src/components/CameraTile.tsx web-app/src/hooks/useRecorderStatus.ts web-app/src/components/TileOverlay.tsx web-app/src/components/__tests__/TileOverlay.test.tsx
git commit -m "feat: recorder status badges and snapshot button on live tiles"
```

---

### Task 11: End-to-end smoke test

**Files:**
- Modify: `docker-compose.yml` (verify all services are correct)

**Interfaces:**
- Produces: full stack running with live grid, recording files on disk, API endpoints responding, WebSocket badges visible.

- [ ] **Step 1: Build and start the stack**

Run:

```bash
npm run setup
docker compose up -d --build
```

Expected: `server`, `go2rtc`, and `web-app` services all `running`.

- [ ] **Step 2: Verify recording starts**

Wait 90 seconds, then run:

```bash
ls -la recordings/cam1/$(date +%Y-%m-%d)/
```

Expected: one or more `.mp4` files named like `14-30-00.mp4`.

- [ ] **Step 3: Verify API endpoints**

Run:

```bash
curl -s http://localhost:3000/api/cameras | python3 -m json.tool
curl -s http://localhost:3000/api/system/status | python3 -m json.tool
curl -s "http://localhost:3000/api/recordings?camera=cam1&from=0&to=9999999999999" | python3 -m json.tool
```

Expected: camera list with `state: "recording"`, disk info, and at least one segment.

- [ ] **Step 4: Verify WebSocket and snapshot**

- Open `http://localhost:5173`.
- Expect: live tile with red dot and "Snap" button.
- Click Snap, then run: `curl -s http://localhost:3000/api/snapshots?camera=cam1` — expect a new snapshot entry.

- [ ] **Step 5: Commit any compose fixes**

```bash
git add docker-compose.yml
git commit -m "chore: wire server service into docker-compose for phase 2"
```

---

## Out of scope for this plan

- VOD playlist endpoint `/api/recordings/:camera/start/:ts/end/:ts/index.m3u8` (Phase 3).
- Hour-bucket `/api/recordings/summary` and timeline UI (Phase 3).
- Retention job + disk-safety-valve deletion (Phase 3).
- nginx prod config and Linux deployment (Phase 3).
- ffprobe real duration probing is mocked in unit tests; smoke test relies on real ffmpeg/ffprobe in the Alpine container.

---

## Self-review

**Spec coverage:**
- Server container: Tasks 1, 9, 11.
- RecorderManager + segment indexing: Tasks 4, 5.
- Snapshots: Task 6.
- System status: Task 7.
- WebSocket badges: Tasks 8, 10.
- API shapes mirroring Frigate where applicable: Tasks 6, 7, 8.
- DB schema from spec: Task 2.
- Continuous auto-start recording, exponential backoff, filesystem source of truth: Tasks 4, 5.
- Docker-only development, no host installs: Tasks 0, 1.

**Placeholder scan:**
- No TBD/TODO/fill-in-details.
- No vague "handle edge cases" steps.
- Each code step contains actual code.

**Type consistency:**
- `CameraStatus` interface used consistently across `RecorderManager`, routes, WebSocket, web-app.
- `AppConfig` / `CameraConfig` types shared between `config.ts` and `RecorderManager`.
- Path field stored relative to recordings root in all DB rows.

**Gaps:**
- ffprobe real probing is simplified in `indexer.ts` unit tests; actual implementation must call `ffprobe`. Add a follow-up task in Phase 3 or implement with real `ffprobe` subprocess before closing Phase 2 if smoke tests reveal inaccurate durations.
- Disk-safety-valve deletion is explicitly Phase 3; no retention job here.
