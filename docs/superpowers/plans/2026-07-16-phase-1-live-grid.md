# Phase 1 — Live Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live view of all configured cameras in a browser (phone + desktop) with sub-second latency, running via docker-compose.

**Architecture:** go2rtc connects once to each camera's `rtsps://` URL and restreams WebRTC/MSE to the browser. A small generator script renders go2rtc's config and a public camera list from a single `cameras.yml`. The React client (Vite + Tailwind, mobile-first) shows a responsive grid of live tiles using go2rtc's `video-stream` web component.

**Tech Stack:** Docker Compose, go2rtc 1.9.x, Node 22, TypeScript (strict), Vite, React 18, Tailwind CSS v4, vitest, `yaml` npm package.

**Spec:** `docs/superpowers/specs/2026-07-16-core-nvr-design.md`

## Global Constraints

- TypeScript everywhere, `"strict": true` in every tsconfig.
- Secrets (camera URLs with credentials, host IP) live ONLY in `.env` (gitignored). Generated files and compose files must be committable — they reference `${ENV_VARS}`, never literal credentials.
- `cameras.yml` is the single source of truth for cameras. Nothing else hardcodes camera ids/names.
- Mobile-first CSS: base styles target phones; desktop via `min-width` breakpoints (Tailwind `md:`/`lg:` prefixes).
- Video elements must have `playsinline` behavior (handled by go2rtc's web component) and the grid must work in iOS Safari and desktop Chrome.
- go2rtc is the only component that talks to cameras.
- Commit after every green test cycle. Conventional commit messages (`feat:`, `test:`, `chore:`).

## File Structure

```
camera-dashboard/
├── .env.example              # template for secrets (committed)
├── .gitignore
├── cameras.yml               # single source of truth for cameras
├── docker-compose.yml        # go2rtc + client services
├── package.json              # root: generator script deps (yaml, tsx, vitest)
├── tsconfig.json             # root: for tools/
├── tools/
│   ├── config.ts             # load + validate cameras.yml (pure functions)
│   ├── render.ts             # render go2rtc.yaml + cameras.json strings
│   ├── generate.ts           # CLI entry: read files, write outputs
│   └── __tests__/
│       ├── config.test.ts
│       └── render.test.ts
├── go2rtc/
│   └── go2rtc.yaml           # GENERATED (committed — no secrets, only ${VARS})
└── client/
    ├── package.json
    ├── vite.config.ts        # Tailwind plugin + /go2rtc proxy (http + ws)
    ├── tsconfig.json
    ├── index.html
    ├── public/
    │   └── cameras.json      # GENERATED (committed — id/name only)
    └── src/
        ├── main.tsx
        ├── index.css         # Tailwind entry
        ├── App.tsx           # shell: routes + TabBar
        ├── types.ts          # Camera type
        ├── lib/
        │   └── go2rtc.ts     # base URL + video-stream.js script loader
        ├── hooks/
        │   ├── useCameras.ts
        │   └── __tests__/useCameras.test.ts
        └── components/
            ├── TabBar.tsx
            ├── LiveGrid.tsx
            ├── CameraTile.tsx
            ├── VideoStream.tsx
            └── __tests__/LiveGrid.test.tsx
```

---

### Task 1: Repo scaffolding + camera config source of truth

**Files:**
- Create: `.gitignore`, `.env.example`, `cameras.yml`, `package.json`, `tsconfig.json`

**Interfaces:**
- Produces: `cameras.yml` schema consumed by Task 2 — a `cameras` array where each entry has `id` (string, slug), `name` (string), `url` (string, may contain `${ENV_VAR}`), `enabled` (boolean), `retention_days` (number). Also a top-level `webrtc_candidate` (string, `${HOST_IP}:8555`).

- [x] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
.env
dist/
recordings/
data/
*.log
```

- [x] **Step 2: Create `.env.example`**

```sh
# Copy to .env and fill in. NEVER commit .env.
# RTSPS URL for camera 1 (Wyze Cam v3, native RTSPS on port 322)
CAM1_RTSP_URL=rtsps://username:password@192.168.68.107:322/stream0
# LAN IP of the machine running docker (used as WebRTC candidate)
HOST_IP=192.168.68.100
```

- [x] **Step 3: Create `cameras.yml`**

```yaml
# Single source of truth for cameras.
# `url` values reference env vars resolved by go2rtc at runtime —
# never put credentials in this file.
webrtc_candidate: ${HOST_IP}:8555

cameras:
  - id: cam1
    name: Front Door
    url: ${CAM1_RTSP_URL}
    enabled: true
    retention_days: 7
```

- [x] **Step 4: Create root `package.json`**

```json
{
  "name": "camera-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "tsx tools/generate.ts",
    "test": "vitest run"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "yaml": "^2.5.0"
  }
}
```

- [x] **Step 5: Create root `tsconfig.json`**

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
  "include": ["tools"]
}
```

- [x] **Step 6: Install and verify**

Run: `npm install && npx tsc --noEmit`
Expected: installs cleanly; tsc exits 0 (no source files yet is fine).

- [x] **Step 7: Create local `.env`**

Run: `cp .env.example .env` and fill in the real Wyze URL (from the password manager per PROJECT_NOTES.md) and this Mac's LAN IP (`ipconfig getifaddr en0`).
Expected: `.env` exists, `git status` does NOT list it.

- [x] **Step 8: Commit**

```bash
git add .gitignore .env.example cameras.yml package.json tsconfig.json package-lock.json
git commit -m "chore: scaffold repo with cameras.yml as config source of truth"
```

---

### Task 2: Config generator (cameras.yml → go2rtc.yaml + cameras.json)

**Files:**
- Create: `tools/config.ts`, `tools/render.ts`, `tools/generate.ts`
- Test: `tools/__tests__/config.test.ts`, `tools/__tests__/render.test.ts`

**Interfaces:**
- Consumes: `cameras.yml` schema from Task 1.
- Produces:
  - `loadConfig(yamlText: string): AppConfig` — throws `Error` with a descriptive message on invalid input.
  - `renderGo2rtc(config: AppConfig): string` and `renderClientCameras(config: AppConfig): string`.
  - Types: `CameraConfig { id: string; name: string; url: string; enabled: boolean; retentionDays: number }`, `AppConfig { webrtcCandidate: string; cameras: CameraConfig[] }`.
  - Generated file `client/public/cameras.json`: array of `{ id: string; name: string }` for enabled cameras only (consumed by Task 5).
  - Generated file `go2rtc/go2rtc.yaml` (consumed by Task 3).

- [x] **Step 1: Write failing tests for `loadConfig`**

`tools/__tests__/config.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { loadConfig } from "../config"

const VALID = `
webrtc_candidate: \${HOST_IP}:8555
cameras:
  - id: cam1
    name: Front Door
    url: \${CAM1_RTSP_URL}
    enabled: true
    retention_days: 7
`

describe("loadConfig", () => {
  it("parses a valid config", () => {
    const cfg = loadConfig(VALID)
    expect(cfg.webrtcCandidate).toBe("${HOST_IP}:8555")
    expect(cfg.cameras).toEqual([
      {
        id: "cam1",
        name: "Front Door",
        url: "${CAM1_RTSP_URL}",
        enabled: true,
        retentionDays: 7,
      },
    ])
  })

  it("rejects duplicate camera ids", () => {
    const dup = VALID + `
  - id: cam1
    name: Copy
    url: \${CAM2_RTSP_URL}
    enabled: true
    retention_days: 7
`
    expect(() => loadConfig(dup)).toThrow(/duplicate camera id/i)
  })

  it("rejects ids that are not slugs", () => {
    expect(() => loadConfig(VALID.replace("cam1", "Cam 1!"))).toThrow(/id/i)
  })

  it("rejects a config with no cameras", () => {
    expect(() => loadConfig("webrtc_candidate: x\ncameras: []")).toThrow(/at least one camera/i)
  })

  it("rejects missing url", () => {
    expect(() => loadConfig(VALID.replace(/^\s*url:.*$/m, ""))).toThrow(/url/i)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tools/__tests__/config.test.ts`
Expected: FAIL — cannot resolve `../config`.

- [x] **Step 3: Implement `tools/config.ts`**

```ts
import { parse } from "yaml"

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

export function loadConfig(yamlText: string): AppConfig {
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
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/config.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add tools/config.ts tools/__tests__/config.test.ts
git commit -m "feat: load and validate cameras.yml"
```

- [x] **Step 6: Write failing tests for the renderers**

`tools/__tests__/render.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { AppConfig } from "../config"
import { renderClientCameras, renderGo2rtc } from "../render"

const CFG: AppConfig = {
  webrtcCandidate: "${HOST_IP}:8555",
  cameras: [
    { id: "cam1", name: "Front Door", url: "${CAM1_RTSP_URL}", enabled: true, retentionDays: 7 },
    { id: "cam2", name: "Garage", url: "${CAM2_RTSP_URL}", enabled: false, retentionDays: 7 },
  ],
}

describe("renderGo2rtc", () => {
  it("renders streams for enabled cameras only, with env placeholders intact", () => {
    const out = renderGo2rtc(CFG)
    expect(out).toContain("cam1:")
    expect(out).toContain("${CAM1_RTSP_URL}")
    expect(out).not.toContain("cam2:")
    expect(out).toContain('listen: ":1984"')   // api
    expect(out).toContain('listen: ":8554"')   // rtsp restream
    expect(out).toContain('listen: ":8555"')   // webrtc
    expect(out).toContain("${HOST_IP}:8555")   // candidate
    expect(out).toMatch(/^# GENERATED/)
  })
})

describe("renderClientCameras", () => {
  it("emits id and name only (no urls) for enabled cameras", () => {
    const list = JSON.parse(renderClientCameras(CFG)) as unknown[]
    expect(list).toEqual([{ id: "cam1", name: "Front Door" }])
  })
})
```

- [x] **Step 7: Run tests to verify they fail**

Run: `npx vitest run tools/__tests__/render.test.ts`
Expected: FAIL — cannot resolve `../render`.

- [x] **Step 8: Implement `tools/render.ts`**

```ts
import { stringify } from "yaml"
import type { AppConfig } from "./config"

const HEADER = "# GENERATED by `npm run generate` from cameras.yml — do not edit by hand.\n"

export function renderGo2rtc(config: AppConfig): string {
  const streams: Record<string, string[]> = {}
  for (const cam of config.cameras) {
    if (cam.enabled) streams[cam.id] = [cam.url]
  }
  const doc = {
    api: { listen: ":1984" },
    rtsp: { listen: ":8554" },
    webrtc: { listen: ":8555", candidates: [config.webrtcCandidate] },
    streams,
  }
  return HEADER + stringify(doc, { defaultStringType: "QUOTE_DOUBLE", defaultKeyType: "PLAIN" })
}

export function renderClientCameras(config: AppConfig): string {
  const list = config.cameras
    .filter((cam) => cam.enabled)
    .map((cam) => ({ id: cam.id, name: cam.name }))
  return JSON.stringify(list, null, 2) + "\n"
}
```

- [x] **Step 9: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/render.test.ts`
Expected: PASS (2 tests).

- [x] **Step 10: Implement the CLI entry `tools/generate.ts`**

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { loadConfig } from "./config"
import { renderClientCameras, renderGo2rtc } from "./render"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const config = loadConfig(readFileSync(join(root, "cameras.yml"), "utf8"))

const go2rtcPath = join(root, "go2rtc", "go2rtc.yaml")
mkdirSync(dirname(go2rtcPath), { recursive: true })
writeFileSync(go2rtcPath, renderGo2rtc(config))

const camerasJsonPath = join(root, "client", "public", "cameras.json")
mkdirSync(dirname(camerasJsonPath), { recursive: true })
writeFileSync(camerasJsonPath, renderClientCameras(config))

console.log(`wrote ${go2rtcPath}`)
console.log(`wrote ${camerasJsonPath}`)
```

- [x] **Step 11: Run the generator and inspect output**

Run: `npm run generate && cat go2rtc/go2rtc.yaml client/public/cameras.json`
Expected: both files written; go2rtc.yaml contains `${CAM1_RTSP_URL}` placeholder (NOT a real URL); cameras.json is `[{ "id": "cam1", "name": "Front Door" }]`.

- [x] **Step 12: Commit**

```bash
git add tools/ go2rtc/go2rtc.yaml client/public/cameras.json
git commit -m "feat: generate go2rtc config and client camera list from cameras.yml"
```

---

### Task 3: docker-compose with go2rtc, live stream verified

**Files:**
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: `go2rtc/go2rtc.yaml` from Task 2; `.env` from Task 1.
- Produces: go2rtc reachable at `http://localhost:1984` (API + built-in UI), RTSP restream at `rtsp://localhost:8554/cam1`, WebRTC on port 8555. Task 8 adds the `client` service to this same file.

- [x] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  go2rtc:
    image: alexxit/go2rtc:1.9.7
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./go2rtc/go2rtc.yaml:/config/go2rtc.yaml:ro
    ports:
      - "1984:1984"       # API + web UI
      - "8554:8554"       # RTSP restream (recorder consumes this in Phase 2)
      - "8555:8555/tcp"   # WebRTC
      - "8555:8555/udp"   # WebRTC
```

Note: go2rtc resolves `${CAM1_RTSP_URL}` and `${HOST_IP}` inside its config from the container environment supplied by `env_file`.

- [x] **Step 2: Start it**

Run: `docker compose up -d go2rtc && docker compose logs go2rtc | tail -20`
Expected: log lines showing config loaded and listeners on :1984, :8554, :8555; no auth/TLS errors for cam1.

- [x] **Step 3: Verify the stream via API**

Run: `curl -s http://localhost:1984/api/streams | python3 -m json.tool`
Expected: JSON containing a `cam1` entry. Then check a producer is connected:
`curl -s "http://localhost:1984/api/frame.jpeg?src=cam1" -o /tmp/frame.jpg && file /tmp/frame.jpg`
Expected: `JPEG image data` — a real frame from the camera.

- [x] **Step 4: Verify WebRTC in a browser (manual)**

Open `http://localhost:1984/stream.html?src=cam1` in Chrome.
Expected: live video with ~sub-second latency. If video fails on WebRTC, go2rtc falls back to MSE — still acceptable for Docker Desktop on Mac (note in PROJECT_NOTES if that happens).

- [x] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: run go2rtc via docker-compose with generated config"
```

---

### Task 4: Client scaffold (Vite + React + TS + Tailwind + vitest) with app shell

**Files:**
- Create: `client/package.json`, `client/vite.config.ts`, `client/tsconfig.json`, `client/index.html`, `client/src/main.tsx`, `client/src/index.css`, `client/src/App.tsx`, `client/src/components/TabBar.tsx`

**Interfaces:**
- Produces: running Vite dev server on :5173 with `/go2rtc` proxied (http + ws) to go2rtc; `<App>` shell with two views — `live` (filled in Task 7) and `timeline` (placeholder until Phase 3); `TabBar` with `view`/`onChange` props as defined below.

- [x] **Step 1: Create `client/package.json`**

```json
{
  "name": "camera-dashboard-client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [x] **Step 2: Create `client/vite.config.ts`**

```ts
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
// vitest/config re-exports Vite's defineConfig with the `test` field typed
import { defineConfig } from "vitest/config"

// In the dev container go2rtc is reachable as http://go2rtc:1984;
// when running Vite directly on the host it's http://localhost:1984.
const go2rtcTarget = process.env.GO2RTC_URL ?? "http://localhost:1984"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/go2rtc": {
        target: go2rtcTarget,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/go2rtc/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
  },
})
```

- [x] **Step 3: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "types": ["vite/client", "vitest/globals"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

- [x] **Step 4: Create `client/index.html`**

```html
<!doctype html>
<html lang="en" class="h-full">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Camera Dashboard</title>
  </head>
  <body class="h-full bg-neutral-950 text-neutral-100">
    <div id="root" class="h-full"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [x] **Step 5: Create `client/src/index.css`**

```css
@import "tailwindcss";

/* Mobile browser chrome: prefer dynamic viewport height */
html,
body,
#root {
  height: 100dvh;
}
```

- [x] **Step 6: Create `client/src/main.tsx`**

```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [x] **Step 7: Create `client/src/components/TabBar.tsx`**

```tsx
export type View = "live" | "timeline"

interface TabBarProps {
  view: View
  onChange: (view: View) => void
}

const TABS: { id: View; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "timeline", label: "Timeline" },
]

export default function TabBar({ view, onChange }: TabBarProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-neutral-800 bg-neutral-900 pb-[env(safe-area-inset-bottom)] md:static md:border-b md:border-t-0 md:pb-0"
      aria-label="Main navigation"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          aria-current={view === tab.id ? "page" : undefined}
          className={`flex-1 py-3 text-sm font-medium md:flex-none md:px-6 ${
            view === tab.id ? "text-white" : "text-neutral-500"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
```

- [x] **Step 8: Create `client/src/App.tsx`**

```tsx
import { useState } from "react"
import TabBar, { type View } from "./components/TabBar"

export default function App() {
  const [view, setView] = useState<View>("live")

  return (
    <div className="flex h-full flex-col-reverse md:flex-col">
      <TabBar view={view} onChange={setView} />
      <main className="flex-1 overflow-y-auto pb-14 md:pb-0">
        {view === "live" ? (
          <p className="p-4 text-neutral-400">Live grid goes here (Task 7)</p>
        ) : (
          <p className="p-4 text-neutral-400">Timeline arrives in Phase 3</p>
        )}
      </main>
    </div>
  )
}
```

- [x] **Step 9: Install and verify dev server**

Run: `npm install` then `npm run dev` (both in `client/`).
Open `http://localhost:5173` — expected: dark shell, "Live/Timeline" tabs at the bottom on a narrow window and at the top when the window is ≥768px wide. Verify by resizing devtools.

- [x] **Step 10: Commit**

```bash
git add client/
git commit -m "feat: scaffold React client with Tailwind and mobile-first tab shell"
```

---

### Task 5: Camera list loading (types + hook)

**Files:**
- Create: `client/src/types.ts`, `client/src/hooks/useCameras.ts`
- Test: `client/src/hooks/__tests__/useCameras.test.ts`

**Interfaces:**
- Consumes: `client/public/cameras.json` (`[{ id, name }]`) generated in Task 2, served by Vite at `/cameras.json`.
- Produces: `Camera { id: string; name: string }` type and `useCameras(): { cameras: Camera[]; error: string | null; loading: boolean }` — consumed by `LiveGrid` in Task 7.

- [x] **Step 1: Create `client/src/types.ts`**

```ts
export interface Camera {
  id: string
  name: string
}
```

- [x] **Step 2: Write the failing hook test**

`client/src/hooks/__tests__/useCameras.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useCameras } from "../useCameras"

describe("useCameras", () => {
  afterEach(() => vi.restoreAllMocks())

  it("loads cameras from /cameras.json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: "cam1", name: "Front Door" }]), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    const { result } = renderHook(() => useCameras())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cameras).toEqual([{ id: "cam1", name: "Front Door" }])
    expect(result.current.error).toBeNull()
    expect(fetch).toHaveBeenCalledWith("/cameras.json")
  })

  it("reports an error on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })))
    const { result } = renderHook(() => useCameras())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cameras).toEqual([])
    expect(result.current.error).toMatch(/500/)
  })
})
```

- [x] **Step 3: Run test to verify it fails**

Run (in `client/`): `npx vitest run src/hooks/__tests__/useCameras.test.ts`
Expected: FAIL — cannot resolve `../useCameras`.

- [x] **Step 4: Implement `client/src/hooks/useCameras.ts`**

```ts
import { useEffect, useState } from "react"
import type { Camera } from "../types"

export function useCameras() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/cameras.json")
      .then((res) => {
        if (!res.ok) throw new Error(`failed to load cameras: HTTP ${res.status}`)
        return res.json() as Promise<Camera[]>
      })
      .then((list) => {
        if (!cancelled) setCameras(list)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { cameras, error, loading }
}
```

- [x] **Step 5: Run test to verify it passes**

Run (in `client/`): `npx vitest run src/hooks/__tests__/useCameras.test.ts`
Expected: PASS (2 tests).

- [x] **Step 6: Commit**

```bash
git add client/src/types.ts client/src/hooks/
git commit -m "feat: load camera list from generated cameras.json"
```

---

### Task 6: VideoStream wrapper around go2rtc's web component

**Files:**
- Create: `client/src/lib/go2rtc.ts`, `client/src/components/VideoStream.tsx`

**Interfaces:**
- Consumes: go2rtc proxied at `/go2rtc` (Vite proxy from Task 4); go2rtc serves its `video-stream` custom element at `/go2rtc/video-stream.js`.
- Produces: `<VideoStream cameraId="cam1" paused={false} className="..." />` — consumed by `CameraTile` in Task 7. Also `posterUrl(cameraId: string): string` for still-frame posters.

- [x] **Step 1: Implement `client/src/lib/go2rtc.ts`**

```ts
export const GO2RTC_BASE = "/go2rtc"

export function posterUrl(cameraId: string): string {
  return `${GO2RTC_BASE}/api/frame.jpeg?src=${encodeURIComponent(cameraId)}`
}

export function streamWsUrl(cameraId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}${GO2RTC_BASE}/api/ws?src=${encodeURIComponent(cameraId)}`
}

let scriptPromise: Promise<void> | null = null

/** Load go2rtc's video-stream.js custom element exactly once. */
export function loadVideoStreamElement(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.type = "module"
      script.src = `${GO2RTC_BASE}/video-stream.js`
      script.onload = () => resolve()
      script.onerror = () => {
        scriptPromise = null
        reject(new Error("failed to load video-stream.js from go2rtc"))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}
```

- [x] **Step 2: Implement `client/src/components/VideoStream.tsx`**

```tsx
import { useEffect, useRef, useState } from "react"
import { loadVideoStreamElement, posterUrl, streamWsUrl } from "../lib/go2rtc"

interface VideoStreamProps {
  cameraId: string
  /** When true, tear down the stream and show a still poster instead. */
  paused?: boolean
  className?: string
}

export default function VideoStream({ cameraId, paused = false, className }: VideoStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || paused) return
    let cancelled = false

    loadVideoStreamElement()
      .then(() => {
        if (cancelled) return
        // video-stream is go2rtc's custom element: set .mode and .src, it does the rest.
        const el = document.createElement("video-stream") as HTMLElement & {
          mode: string
          src: string
        }
        el.mode = "webrtc,mse"
        el.src = streamWsUrl(cameraId)
        el.style.width = "100%"
        el.style.height = "100%"
        container.replaceChildren(el)
      })
      .catch(() => setFailed(true))

    return () => {
      cancelled = true
      container.replaceChildren()
    }
  }, [cameraId, paused])

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-neutral-900 text-sm text-red-400 ${className ?? ""}`}>
        stream unavailable
      </div>
    )
  }

  if (paused) {
    return (
      <img
        src={posterUrl(cameraId)}
        alt={`${cameraId} paused`}
        className={`h-full w-full object-contain ${className ?? ""}`}
      />
    )
  }

  return <div ref={containerRef} className={className} />
}
```

- [x] **Step 3: Verify manually against live go2rtc**

With `docker compose up -d go2rtc` running and `npm run dev` in `client/`, temporarily change `App.tsx`'s live branch to `<VideoStream cameraId="cam1" className="aspect-video" />`, open `http://localhost:5173`.
Expected: live video renders inside the app shell. Revert the temporary change afterwards (`git checkout client/src/App.tsx` if needed — Task 7 wires it properly).

- [x] **Step 4: Commit**

```bash
git add client/src/lib/go2rtc.ts client/src/components/VideoStream.tsx
git commit -m "feat: wrap go2rtc video-stream element in a React component"
```

---

### Task 7: CameraTile + LiveGrid (responsive, pause offscreen, fullscreen)

**Files:**
- Create: `client/src/components/CameraTile.tsx`, `client/src/components/LiveGrid.tsx`
- Modify: `client/src/App.tsx` (replace the live placeholder with `<LiveGrid />`)
- Test: `client/src/components/__tests__/LiveGrid.test.tsx`

**Interfaces:**
- Consumes: `useCameras()` from Task 5; `VideoStream` from Task 6.
- Produces: `<LiveGrid />` (no props) — the home view.

- [ ] **Step 1: Write the failing grid test**

`client/src/components/__tests__/LiveGrid.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import LiveGrid from "../LiveGrid"

// VideoStream needs a live go2rtc; stub it out for component tests.
vi.mock("../VideoStream", () => ({
  default: ({ cameraId }: { cameraId: string }) => <div data-testid={`stream-${cameraId}`} />,
}))

// jsdom has no IntersectionObserver; stub one that reports "visible".
class FakeIntersectionObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.cb([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never)
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)

function mockCameras(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  )
}

describe("LiveGrid", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("renders one tile per camera with its name", async () => {
    mockCameras([
      { id: "cam1", name: "Front Door" },
      { id: "cam2", name: "Garage" },
    ])
    render(<LiveGrid />)
    await waitFor(() => expect(screen.getByText("Front Door")).toBeTruthy())
    expect(screen.getByText("Garage")).toBeTruthy()
    expect(screen.getByTestId("stream-cam1")).toBeTruthy()
    expect(screen.getByTestId("stream-cam2")).toBeTruthy()
  })

  it("shows an error state when cameras fail to load", async () => {
    mockCameras("boom", 500)
    render(<LiveGrid />)
    await waitFor(() => expect(screen.getByText(/HTTP 500/)).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (in `client/`): `npx vitest run src/components/__tests__/LiveGrid.test.tsx`
Expected: FAIL — cannot resolve `../LiveGrid`.

- [ ] **Step 3: Implement `client/src/components/CameraTile.tsx`**

```tsx
import { useEffect, useRef, useState } from "react"
import type { Camera } from "../types"
import VideoStream from "./VideoStream"

interface CameraTileProps {
  camera: Camera
}

export default function CameraTile({ camera }: CameraTileProps) {
  const tileRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  // Pause streams for tiles scrolled out of view (bandwidth/battery on phones).
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

  return (
    <div
      ref={tileRef}
      onClick={toggleFullscreen}
      className="relative aspect-video overflow-hidden rounded-lg bg-black"
    >
      <VideoStream cameraId={camera.id} paused={!visible} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-2">
        <span className="text-sm font-medium">{camera.name}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `client/src/components/LiveGrid.tsx`**

```tsx
import { useCameras } from "../hooks/useCameras"
import CameraTile from "./CameraTile"

export default function LiveGrid() {
  const { cameras, error, loading } = useCameras()

  if (loading) return <p className="p-4 text-neutral-400">Loading cameras…</p>
  if (error) return <p className="p-4 text-red-400">{error}</p>
  if (cameras.length === 0) return <p className="p-4 text-neutral-400">No cameras configured.</p>

  return (
    <div className="grid grid-cols-1 gap-2 p-2 md:grid-cols-[repeat(auto-fit,minmax(400px,1fr))] md:gap-3 md:p-3">
      {cameras.map((camera) => (
        <CameraTile key={camera.id} camera={camera} />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Wire into `client/src/App.tsx`**

Replace the live placeholder line:

```tsx
import { useState } from "react"
import LiveGrid from "./components/LiveGrid"
import TabBar, { type View } from "./components/TabBar"

export default function App() {
  const [view, setView] = useState<View>("live")

  return (
    <div className="flex h-full flex-col-reverse md:flex-col">
      <TabBar view={view} onChange={setView} />
      <main className="flex-1 overflow-y-auto pb-14 md:pb-0">
        {view === "live" ? (
          <LiveGrid />
        ) : (
          <p className="p-4 text-neutral-400">Timeline arrives in Phase 3</p>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 6: Run all client tests**

Run (in `client/`): `npx vitest run`
Expected: PASS — LiveGrid tests (2) + useCameras tests (2).

- [ ] **Step 7: Verify live in browsers (manual)**

With go2rtc up and `npm run dev`:
- Desktop Chrome: live tile with camera name overlay; tile click toggles fullscreen; window ≥768px shows grid layout and top tabs.
- iPhone Safari (same LAN, `http://<mac-ip>:5173`): full-width tile, bottom tab bar above the home indicator, video plays inline (not hijacked to native fullscreen), scrolling the tile offscreen and back swaps stream→poster→stream.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/ client/src/App.tsx
git commit -m "feat: live camera grid with offscreen pause and fullscreen tiles"
```

---

### Task 8: Client dev container in docker-compose + Phase 1 smoke test

**Files:**
- Modify: `docker-compose.yml` (add `client` service)

**Interfaces:**
- Consumes: everything above.
- Produces: `docker compose up` brings up the whole Phase 1 stack; client on `http://localhost:5173`. (Prod nginx build is deferred to Phase 3, when there's an API to proxy — YAGNI until then.)

- [ ] **Step 1: Add the `client` service to `docker-compose.yml`**

```yaml
  client:
    image: node:22-alpine
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    environment:
      GO2RTC_URL: http://go2rtc:1984
    volumes:
      - ./client:/app
      - client_node_modules:/app/node_modules
    ports:
      - "5173:5173"
    depends_on:
      - go2rtc

volumes:
  client_node_modules:
```

(The named volume keeps Linux-built `node_modules` from clobbering the Mac-built ones in the bind mount.)

- [ ] **Step 2: Full-stack smoke test**

Run: `docker compose up -d && docker compose ps`
Expected: both services `running`. Then open `http://localhost:5173`:
- Live grid shows cam1 playing.
- `docker compose logs client | tail -5` shows Vite ready, no proxy errors.

- [ ] **Step 3: Phase 1 acceptance checklist (manual, from spec success criteria)**

- [ ] Live view on desktop Chrome with ~sub-second latency (wave at the camera).
- [ ] Live view on iPhone Safari over LAN.
- [ ] `cameras.yml` edit → `npm run generate` → `docker compose restart go2rtc` picks up a renamed camera without touching any other file.
- [ ] No credentials appear in any committed file: `git grep -I "rtsps://" -- ':!*.example' ':!docs'` returns only `${...}` placeholders or nothing.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: run client dev server via docker-compose"
```

---

## Out of scope for this plan

- Express server, recording, snapshots-to-disk, WebSocket status (Phase 2 plan).
- Timeline UI, VOD playback, retention, nginx prod build, Linux deployment (Phase 3 plan).
- Status badges on tiles (`REC`/`retrying`) — they need the Phase 2 WebSocket; tiles ship with name-only overlay for now.
