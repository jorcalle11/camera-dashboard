# Phase 3b — Timeline Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 3a mock fixtures with real recording data — summary endpoint for coverage, HLS VOD for playback, retention job for disk management, client wired to real APIs.

**Architecture:** Server gets two new endpoints (summary + VOD) and a retention job. Client swaps mock hooks for real API calls and integrates hls.js for HLS playback.

**Tech Stack:** Express, better-sqlite3, hls.js, React 18, TypeScript, Vite, Tailwind v4, vitest.

## Global Constraints

- No server/API changes beyond what the spec defines
- No new UI framework dependencies beyond hls.js
- Theme-aware (dark/light) preserved
- Mobile-first; strip hit area ≥56px
- Existing test patterns: vitest + testing-library for client, vitest for server

---

## File structure

```
server/src/
  routes/recordings.ts          # Modify — add GET /summary
  routes/vod.ts                 # Create — VOD m3u8 generation
  recorder/RetentionJob.ts      # Create — retention logic
  app.ts                        # Modify — mount VOD router
  index.ts                      # Modify — instantiate RetentionJob
  config.ts                     # Modify — add retentionMaxSizeGb
web-app/src/
  hooks/useRecordingsSummary.ts # Create — API hook for summary
  hooks/useCameras.ts           # Modify — switch to real API
  components/PlaybackPlayer.tsx  # Modify — HLS integration
  components/TimelinePage.tsx    # Modify — wire to real hooks
  components/DateSelect.tsx      # Modify — use retention days
  lib/timeline.ts                # Modify — remove TimelineCoverageFile
  hooks/useTimelineFixtures.ts   # Delete
  hooks/__tests__/useTimelineFixtures.test.ts  # Delete
  public/fixtures/               # Delete
web-app/package.json             # Modify — add hls.js
```

---

### Task 1: Server — Summary endpoint

**Files:**
- Modify: `server/src/routes/recordings.ts`
- Create: `server/src/routes/recordings.test.ts` (or inline test)

**Interfaces:**
- Consumes: `db` (better-sqlite3 Database)
- Produces: `GET /api/cameras/:id/recordings/summary?day=YYYY-MM-DD` → `{ cameraId, day, hours: [{ hour, coverageMs, segmentCount }] }`

- [ ] **Step 1: Add the summary route handler**

Add after the existing `GET /` handler in `recordings.ts`:

```ts
router.get("/summary", (req, res) => {
  const camera = (req.params as { id: string }).id
  const day = req.query.day as string | undefined
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    res.status(400).json({ error: "day query parameter required (YYYY-MM-DD)" })
    return
  }

  const dayStartMs = new Date(`${day}T00:00:00Z`).getTime()
  const dayEndMs = dayStartMs + 86_400_000

  const rows = db
    .prepare(
      `SELECT
        CAST((start_ts - ?) / 3600000 AS INTEGER) AS hour,
        SUM(
          MIN(start_ts + duration_ms, ? + (CAST((start_ts - ?) / 3600000 AS INTEGER) + 1) * 3600000)
          - MAX(start_ts, ? + CAST((start_ts - ?) / 3600000 AS INTEGER) * 3600000)
        ) AS coverageMs,
        COUNT(*) AS segmentCount
      FROM segments
      WHERE camera_id = ?
        AND start_ts + duration_ms > ?
        AND start_ts < ?
      GROUP BY hour
      ORDER BY hour`,
    )
    .all(dayStartMs, dayStartMs, dayStartMs, dayStartMs, dayStartMs, camera, dayStartMs, dayEndMs) as {
    hour: number
    coverageMs: number
    segmentCount: number
  }[]

  res.json({ cameraId: camera, day, hours: rows })
})
```

- [ ] **Step 2: Run existing server tests to verify no regressions**

Run: `cd server && npx vitest run`
Expected: all existing tests pass

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/recordings.ts
git commit -m "feat(server): add recordings summary endpoint for timeline coverage"
```

---

### Task 2: Server — VOD endpoint

**Files:**
- Create: `server/src/routes/vod.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `db` (better-sqlite3 Database), `recordingsRoot` (string)
- Produces: `GET /api/recordings/:camera/start/:start/end/:end/index.m3u8` → HLS playlist

- [ ] **Step 1: Create `server/src/routes/vod.ts`**

```ts
import { Router } from "express"
import type Database from "better-sqlite3"

export interface VodDeps {
  db: Database.Database
  recordingsRoot: string
}

export function vodRouter(deps: VodDeps): Router {
  const { db, recordingsRoot } = deps
  const router = Router({ mergeParams: true })

  router.get("/start/:start/end/:end/index.m3u8", (req, res) => {
    const camera = (req.params as { camera: string }).camera
    const startSec = Number(req.params.start)
    const endSec = Number(req.params.end)

    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec >= endSec) {
      res.status(400).send("Invalid start/end range")
      return
    }

    const startMs = startSec * 1000
    const endMs = endSec * 1000

    const segments = db
      .prepare(
        `SELECT start_ts AS startTs, duration_ms AS durationMs, path
         FROM segments
         WHERE camera_id = ?
           AND start_ts + duration_ms > ?
           AND start_ts < ?
         ORDER BY start_ts ASC`,
      )
      .all(camera, startMs, endMs) as { startTs: number; durationMs: number; path: string }[]

    if (segments.length === 0) {
      res.status(404).send("No segments found for range")
      return
    }

    const lines = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:61",
      "#EXT-X-MEDIA-SEQUENCE:0",
    ]

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!
      let durationSec = seg.durationMs / 1000

      // Trim first segment to window start
      if (i === 0 && seg.startTs < startMs) {
        const overshootMs = startMs - seg.startTs
        durationSec = (seg.durationMs - overshootMs) / 1000
      }

      // Trim last segment to window end
      if (i === segments.length - 1 && seg.startTs + seg.durationMs > endMs) {
        const overshootMs = seg.startTs + seg.durationMs - endMs
        durationSec = (seg.durationMs - overshootMs) / 1000
      }

      if (durationSec <= 0) continue

      const clampedDuration = Math.max(0.1, Math.min(durationSec, 61))
      lines.push(`#EXTINF:${clampedDuration.toFixed(1)},`)
      lines.push(`/api/statics/recordings/${seg.path}`)
    }

    lines.push("#EXT-X-ENDLIST")

    res.set("Content-Type", "application/vnd.apple.mpegurl")
    res.send(lines.join("\n"))
  })

  return router
}
```

- [ ] **Step 2: Mount VOD router in `app.ts`**

In `server/src/app.ts`, add import and mount:

```ts
// Add to imports
import { vodRouter } from "./routes/vod"

// Add after the existing recordings mount (line 27)
app.use("/api/recordings/:camera", vodRouter({ db: deps.db, recordingsRoot: deps.recordingsRoot }))
```

- [ ] **Step 3: Run server tests**

Run: `cd server && npx vitest run`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/vod.ts server/src/app.ts
git commit -m "feat(server): add HLS VOD endpoint for timeline playback"
```

---

### Task 3: Server — Retention job

**Files:**
- Create: `server/src/recorder/RetentionJob.ts`
- Modify: `server/src/config.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `db`, `recordingsRoot`, camera configs, `env.DISK_FREE_THRESHOLD_GB`, WebSocket broadcast function
- Produces: `RetentionJob` class with `start()`, `stop()`, `run()` methods

- [ ] **Step 1: Add `retentionMaxSizeGb` to `CameraConfig` in `config.ts`**

```ts
export interface CameraConfig {
  id: string
  name: string
  url: string
  enabled: boolean
  retentionDays: number
  retentionMaxSizeGb: number
}
```

In the `loadServerConfig` function, update the camera mapping:

```ts
return {
  id: cam.id,
  name: cam.name,
  url: cam.url,
  enabled: cam.enabled,
  retentionDays: cam.retention_days,
  retentionMaxSizeGb: typeof cam.retention_max_size_gb === "number" ? cam.retention_max_size_gb : 50,
}
```

- [ ] **Step 2: Create `server/src/recorder/RetentionJob.ts`**

```ts
import { unlinkSync, rmdirSync, readdirSync, statfsSync } from "node:fs"
import { join } from "node:path"
import type Database from "better-sqlite3"
import type { CameraConfig } from "../config"
import { logger } from "../logger"

const MS_PER_DAY = 86_400_000
const BYTES_PER_GB = 1024 ** 3

export interface RetentionJobDeps {
  db: Database.Database
  recordingsRoot: string
  cameras: CameraConfig[]
  diskFreeThresholdGb: number
  broadcast?: () => void
}

export class RetentionJob {
  private interval: ReturnType<typeof setInterval> | null = null
  private deps: RetentionJobDeps

  constructor(deps: RetentionJobDeps) {
    this.deps = deps
  }

  start() {
    this.interval = setInterval(() => this.run(), 60 * 60 * 1000) // hourly
    logger.info("retention job started (hourly)")
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  run() {
    const { db, recordingsRoot, cameras, diskFreeThresholdGb } = this.deps
    let totalDeleted = 0

    for (const cam of cameras) {
      totalDeleted += this.enforceAgeRetention(cam)
      totalDeleted += this.enforceSizeRetention(cam)
    }

    totalDeleted += this.enforceDiskRetention()

    if (totalDeleted > 0) {
      logger.info({ totalDeleted }, "retention sweep completed")
      this.deps.broadcast?.()
    }
  }

  private enforceAgeRetention(cam: CameraConfig): number {
    const { db, recordingsRoot } = this.deps
    const cutoffMs = Date.now() - cam.retentionDays * MS_PER_DAY

    const segments = db
      .prepare(
        `SELECT id, path FROM segments
         WHERE camera_id = ? AND start_ts < ?
         ORDER BY start_ts ASC`,
      )
      .all(cam.id, cutoffMs) as { id: number; path: string }[]

    const deleteRow = db.prepare("DELETE FROM segments WHERE id = ?")
    let deleted = 0

    for (const seg of segments) {
      try {
        unlinkSync(join(recordingsRoot, seg.path))
        deleteRow.run(seg.id)
        deleted++
      } catch (err: unknown) {
        logger.warn({ path: seg.path, err }, "failed to delete segment")
      }
    }

    if (deleted > 0) {
      this.pruneEmptyFolders(cam.id, recordingsRoot)
      logger.info({ cameraId: cam.id, deleted, reason: "age" }, "retention deleted segments")
    }

    return deleted
  }

  private enforceSizeRetention(cam: CameraConfig): number {
    const { db, recordingsRoot } = this.deps
    const maxBytes = cam.retentionMaxSizeGb * BYTES_PER_GB

    const { totalSize } = db
      .prepare(
        `SELECT COALESCE(SUM(size_bytes), 0) AS totalSize
         FROM segments WHERE camera_id = ?`,
      )
      .get(cam.id) as { totalSize: number }

    if (totalSize <= maxBytes) return 0

    const segments = db
      .prepare(
        `SELECT id, path, size_bytes AS sizeBytes
         FROM segments
         WHERE camera_id = ?
         ORDER BY start_ts ASC`,
      )
      .all(cam.id) as { id: number; path: string; sizeBytes: number }[]

    const deleteRow = db.prepare("DELETE FROM segments WHERE id = ?")
    let freed = 0
    let deleted = 0

    for (const seg of segments) {
      if (totalSize - freed <= maxBytes) break
      try {
        unlinkSync(join(recordingsRoot, seg.path))
        deleteRow.run(seg.id)
        freed += seg.sizeBytes
        deleted++
      } catch (err: unknown) {
        logger.warn({ path: seg.path, err }, "failed to delete segment")
      }
    }

    if (deleted > 0) {
      this.pruneEmptyFolders(cam.id, recordingsRoot)
      logger.info({ cameraId: cam.id, deleted, freedBytes: freed, reason: "size" }, "retention deleted segments")
    }

    return deleted
  }

  private enforceDiskRetention(): number {
    const { db, recordingsRoot, diskFreeThresholdGb } = this.deps
    const thresholdBytes = diskFreeThresholdGb * BYTES_PER_GB

    let freeBytes: number
    try {
      const { bsize, bfree } = statfsSync(recordingsRoot)
      freeBytes = bsize * bfree
    } catch {
      logger.warn("could not check disk space")
      return 0
    }

    if (freeBytes >= thresholdBytes) return 0

    const segments = db
      .prepare(
        `SELECT id, path, size_bytes AS sizeBytes, camera_id AS cameraId
         FROM segments
         ORDER BY start_ts ASC`,
      )
      .all() as { id: number; path: string; sizeBytes: number; cameraId: string }[]

    const deleteRow = db.prepare("DELETE FROM segments WHERE id = ?")
    let freed = 0
    let deleted = 0

    for (const seg of segments) {
      if (freeBytes + freed >= thresholdBytes) break
      try {
        unlinkSync(join(recordingsRoot, seg.path))
        deleteRow.run(seg.id)
        freed += seg.sizeBytes
        deleted++
      } catch (err: unknown) {
        logger.warn({ path: seg.path, err }, "failed to delete segment")
      }
    }

    if (deleted > 0) {
      const affectedCameras = new Set(segments.slice(0, deleted).map((s) => s.cameraId))
      for (const camId of affectedCameras) {
        this.pruneEmptyFolders(camId, recordingsRoot)
      }
      logger.info({ deleted, freedBytes: freed, reason: "disk" }, "retention deleted segments")
    }

    return deleted
  }

  private pruneEmptyFolders(cameraId: string, recordingsRoot: string) {
    const camDir = join(recordingsRoot, cameraId)
    try {
      const days = readdirSync(camDir)
      for (const day of days) {
        const dayDir = join(camDir, day)
        try {
          const entries = readdirSync(dayDir)
          if (entries.length === 0) rmdirSync(dayDir)
        } catch {
          // ignore
        }
      }
    } catch {
      // camera dir may not exist
    }
  }
}
```

- [ ] **Step 3: Instantiate RetentionJob in `index.ts`**

Add import at top:

```ts
import { RetentionJob } from "./recorder/RetentionJob"
```

Add after the recorder start loop (after line 28):

```ts
const retention = new RetentionJob({
  db,
  recordingsRoot: env.RECORDINGS_PATH,
  cameras: config.cameras,
  diskFreeThresholdGb: env.DISK_FREE_THRESHOLD_GB,
})
retention.start()
```

Add to shutdown handler:

```ts
function shutdown() {
  logger.info("shutting down...")
  retention.stop()
  recorder.stopAll()
  watcher.close().catch(() => {})
  server.close(() => process.exit(0))
}
```

- [ ] **Step 4: Run server tests**

Run: `cd server && npx vitest run`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add server/src/recorder/RetentionJob.ts server/src/config.ts server/src/index.ts
git commit -m "feat(server): add retention job with age, size, and disk safety valve"
```

---

### Task 4: Client — Install hls.js

**Files:**
- Modify: `web-app/package.json`

- [ ] **Step 1: Install hls.js**

Run: `cd web-app && npm install hls.js`

- [ ] **Step 2: Commit**

```bash
git add web-app/package.json web-app/package-lock.json
git commit -m "chore(web-app): add hls.js dependency"
```

---

### Task 5: Client — `useRecordingsSummary` hook

**Files:**
- Create: `web-app/src/hooks/useRecordingsSummary.ts`
- Create: `web-app/src/hooks/__tests__/useRecordingsSummary.test.ts`

**Interfaces:**
- Consumes: `cameraId: string`, `day: string`
- Produces: `{ ranges: TimeRange[], loading: boolean, error: string | null }`

- [ ] **Step 1: Create `web-app/src/hooks/useRecordingsSummary.ts`**

```ts
import { useEffect, useState } from "react"
import type { TimeRange } from "../lib/timeline"

interface SummaryHour {
  hour: number
  coverageMs: number
  segmentCount: number
}

interface SummaryResponse {
  cameraId: string
  day: string
  hours: SummaryHour[]
}

function hoursToRanges(hours: SummaryHour[]): TimeRange[] {
  const ranges: TimeRange[] = []
  for (const h of hours) {
    if (h.coverageMs <= 0) continue
    const startMsOfDay = h.hour * 3_600_000
    const endMsOfDay = startMsOfDay + h.covermentMs
    ranges.push({ startMsOfDay, endMsOfDay })
  }
  return ranges
}

export function useRecordingsSummary(cameraId: string, day: string) {
  const [ranges, setRanges] = useState<TimeRange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/cameras/${encodeURIComponent(cameraId)}/recordings/summary?day=${day}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as SummaryResponse
      })
      .then((data) => {
        if (!cancelled) {
          setRanges(hoursToRanges(data.hours))
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [cameraId, day])

  return { ranges, loading, error }
}
```

- [ ] **Step 2: Create `web-app/src/hooks/__tests__/useRecordingsSummary.test.ts`**

```ts
import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useRecordingsSummary } from "../useRecordingsSummary"

describe("useRecordingsSummary", () => {
  it("converts hours response to TimeRange[]", async () => {
    const mockResponse = {
      cameraId: "cam1",
      day: "2026-07-23",
      hours: [
        { hour: 10, coverageMs: 3600000, segmentCount: 60 },
        { hour: 11, coverageMs: 1800000, segmentCount: 30 },
        { hour: 12, coverageMs: 0, segmentCount: 0 },
      ],
    }

    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const { result } = renderHook(() => useRecordingsSummary("cam1", "2026-07-23"))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.ranges).toEqual([
      { startMsOfDay: 36_000_000, endMsOfDay: 39_600_000 },
      { startMsOfDay: 39_600_000, endMsOfDay: 41_400_000 },
    ])
    expect(result.current.error).toBeNull()

    vi.restoreAllMocks()
  })

  it("sets error on fetch failure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 500 }),
    )

    const { result } = renderHook(() => useRecordingsSummary("cam1", "2026-07-23"))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeTruthy()
    expect(result.current.ranges).toEqual([])

    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 3: Run client tests**

Run: `cd web-app && npx vitest run`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add web-app/src/hooks/useRecordingsSummary.ts web-app/src/hooks/__tests__/useRecordingsSummary.test.ts
git commit -m "feat(web-app): add useRecordingsSummary hook for real coverage data"
```

---

### Task 6: Client — Switch `useCameras` to real API

**Files:**
- Modify: `web-app/src/hooks/useCameras.ts`
- Modify: `web-app/src/types.ts`

**Interfaces:**
- Consumes: `GET /api/cameras`
- Produces: `{ cameras: Camera[], loading, error }` (same interface, different source)

- [ ] **Step 1: Update `types.ts` to match server response**

```ts
export interface Camera {
  id: string
  name: string
  enabled?: boolean
  liveStreamUrl?: string
  recorder?: string
}
```

- [ ] **Step 2: Update `useCameras.ts` to fetch from API**

```ts
import { useEffect, useState } from "react"
import type { Camera } from "../types"

export function useCameras() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/cameras")
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

- [ ] **Step 3: Run client tests**

Run: `cd web-app && npx vitest run`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add web-app/src/hooks/useCameras.ts web-app/src/types.ts
git commit -m "feat(web-app): switch useCameras to real API endpoint"
```

---

### Task 7: Client — HLS integration in PlaybackPlayer

**Files:**
- Modify: `web-app/src/components/PlaybackPlayer.tsx`

**Interfaces:**
- Consumes: `src: string` (m3u8 URL), `playheadMsOfDay`, `playing`, `speed`
- Produces: HLS video playback via hls.js

- [ ] **Step 1: Rewrite PlaybackPlayer with hls.js**

```tsx
import { useEffect, useRef, type RefObject } from "react"
import Hls from "hls.js"
import { formatMsOfDay } from "../lib/timeline"

interface PlaybackPlayerProps {
  src: string
  playheadMsOfDay: number
  playing: boolean
  speed: number
  videoRef?: RefObject<HTMLVideoElement | null>
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onEnded?: () => void
  onLoadedMetadata?: (duration: number) => void
}

export default function PlaybackPlayer({
  src,
  playheadMsOfDay,
  playing,
  speed,
  videoRef: externalRef,
  onTimeUpdate,
  onEnded,
  onLoadedMetadata,
}: PlaybackPlayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null)
  const videoRef = externalRef ?? internalRef
  const hlsRef = useRef<Hls | null>(null)

  // Initialize hls.js and attach to video element
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (src && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hlsRef.current = hls

      hls.loadSource(src)
      hls.attachMedia(el)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        onLoadedMetadata?.(el.duration || 0)
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              hls.destroy()
              break
          }
        }
      })

      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    } else if (src && el.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      el.src = src
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [src, videoRef, onLoadedMetadata])

  // Sync playback state
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (playing) void el.play().catch(() => {})
    else el.pause()
  }, [playing, videoRef, src])

  // Sync speed
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.playbackRate = speed
  }, [speed, videoRef])

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        playsInline
        preload="metadata"
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          onTimeUpdate?.(v.currentTime, v.duration || 0)
        }}
        onEnded={() => onEnded?.()}
        onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget.duration || 0)}
      />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/65 px-2 py-0.5 font-mono text-xs text-white tabular-nums">
        {formatMsOfDay(playheadMsOfDay)}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run client tests**

Run: `cd web-app && npx vitest run`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add web-app/src/components/PlaybackPlayer.tsx
git commit -m "feat(web-app): integrate hls.js in PlaybackPlayer for real video"
```

---

### Task 8: Client — Wire TimelinePage to real data

**Files:**
- Modify: `web-app/src/components/TimelinePage.tsx`

**Interfaces:**
- Consumes: `useRecordingsSummary`, `useCameras`, `PlaybackPlayer` with `src` prop
- Produces: Timeline page with real coverage and HLS playback

- [ ] **Step 1: Rewrite TimelinePage to use real data**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useCameras } from "../hooks/useCameras"
import { useRecordingsSummary } from "../hooks/useRecordingsSummary"
import {
  MS_PER_DAY,
  clamp,
  clampZoom,
  videoTimeToMsOfDay,
} from "../lib/timeline"
import CameraSelect from "./CameraSelect"
import DateSelect from "./DateSelect"
import PlaybackPlayer from "./PlaybackPlayer"
import TimelineStrip, { type ZoomWindow } from "./TimelineStrip"
import TransportBar, { type PlaybackSpeed } from "./TransportBar"

const SPEEDS: PlaybackSpeed[] = [1, 2, 4]
export const TIMELINE_CAMERA_KEY = "timeline.cameraId"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface TimelinePageProps {
  cameraId: string
  onCameraChange: (cameraId: string) => void
  onBack: () => void
}

export default function TimelinePage({ cameraId, onCameraChange, onBack }: TimelinePageProps) {
  const { cameras, loading: camerasLoading, error: camerasError } = useCameras()

  const [day, setDay] = useState(todayIso)
  const [playheadMsOfDay, setPlayheadMsOfDay] = useState(12 * 3600 * 1000)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)
  const [zoom, setZoom] = useState<ZoomWindow>({ startMs: 0, endMs: MS_PER_DAY })
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)

  const { ranges, loading: summaryLoading, error: summaryError } = useRecordingsSummary(cameraId, day)

  // Compute m3u8 URL for current playhead (±5 min window)
  const vodUrl = useMemo(() => {
    const dayStartMs = new Date(`${day}T00:00:00Z`).getTime()
    const playheadAbsMs = dayStartMs + playheadMsOfDay
    const windowMs = 5 * 60 * 1000
    const startSec = Math.floor((playheadAbsMs - windowMs) / 1000)
    const endSec = Math.ceil((playheadAbsMs + windowMs) / 1000)
    return `/api/recordings/${encodeURIComponent(cameraId)}/start/${startSec}/end/${endSec}/index.m3u8`
  }, [cameraId, day, playheadMsOfDay])

  useEffect(() => {
    sessionStorage.setItem(TIMELINE_CAMERA_KEY, cameraId)
  }, [cameraId])

  const seekVideoToPlayhead = useCallback(
    (ms: number) => {
      const el = videoRef.current
      if (!el || !el.duration) return
      scrubbing.current = true
      el.currentTime = (clamp(ms, 0, MS_PER_DAY) / MS_PER_DAY) * el.duration
      queueMicrotask(() => {
        scrubbing.current = false
      })
    },
    [],
  )

  const onPlayheadChange = (ms: number) => {
    const next = clamp(ms, 0, MS_PER_DAY)
    setPlayheadMsOfDay(next)
    seekVideoToPlayhead(next)
  }

  const onSkip = (deltaSec: number) => {
    const el = videoRef.current
    if (el && el.duration) {
      el.currentTime = clamp(el.currentTime + deltaSec, 0, el.duration)
      setPlayheadMsOfDay(videoTimeToMsOfDay(el.currentTime, el.duration))
      return
    }
    onPlayheadChange(playheadMsOfDay + deltaSec * 1000)
  }

  if (camerasLoading || summaryLoading) {
    return <p className="p-4 text-neutral-500 dark:text-neutral-400">Loading timeline…</p>
  }
  if (camerasError || summaryError) {
    return <p className="p-4 text-red-600 dark:text-red-400">{camerasError ?? summaryError}</p>
  }
  if (cameras.length === 0) {
    return <p className="p-4 text-neutral-500 dark:text-neutral-400">No cameras configured.</p>
  }

  return (
    <div ref={containerRef} className="mx-auto flex w-full max-w-3xl flex-col lg:max-w-5xl xl:max-w-7xl">
      <header className="flex items-center justify-between gap-2 px-3 py-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 rounded-md px-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ‹ Live
        </button>
        <CameraSelect cameras={cameras} value={cameraId} onChange={onCameraChange} />
        <DateSelect value={day} retentionDays={7} onChange={setDay} />
      </header>

      <div className="px-3">
        <PlaybackPlayer
          src={vodUrl}
          playheadMsOfDay={playheadMsOfDay}
          playing={playing}
          speed={speed}
          videoRef={videoRef}
          onTimeUpdate={(t, d) => {
            if (scrubbing.current || !d) return
            setPlayheadMsOfDay(videoTimeToMsOfDay(t, d))
          }}
          onEnded={() => setPlaying(false)}
        />
      </div>

      <TransportBar
        playing={playing}
        speed={speed}
        onTogglePlay={() => setPlaying((p) => !p)}
        onSkip={onSkip}
        onCycleSpeed={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!)}
        onFullscreen={() => {
          const el = containerRef.current
          if (!el) return
          if (document.fullscreenElement) void document.exitFullscreen()
          else void el.requestFullscreen()
        }}
      />

      <div className="px-3 text-sm text-neutral-500 dark:text-neutral-400">
        {ranges.length > 0 ? (
          <span>Coverage · {ranges.length} hour(s)</span>
        ) : (
          <span>No footage for this day</span>
        )}
      </div>

      <TimelineStrip
        ranges={ranges}
        playheadMsOfDay={playheadMsOfDay}
        zoom={zoom}
        onPlayheadChange={onPlayheadChange}
        onZoomChange={(z) => setZoom(clampZoom(z.startMs, z.endMs))}
      />
    </div>
  )
}
```

- [ ] **Step 2: Run client tests**

Run: `cd web-app && npx vitest run`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add web-app/src/components/TimelinePage.tsx
git commit -m "feat(web-app): wire TimelinePage to real summary and HLS playback"
```

---

### Task 9: Client — Update DateSelect

**Files:**
- Modify: `web-app/src/components/DateSelect.tsx`

**Interfaces:**
- Consumes: `retentionDays: number` (replaces `fixtureDay`)
- Produces: DateSelect with days within retention window enabled

- [ ] **Step 1: Rewrite DateSelect to use retention window**

```tsx
import { daysAround, addDays } from "../lib/timeline"

interface DateSelectProps {
  value: string
  retentionDays: number
  onChange: (day: string) => void
  radius?: number
}

export default function DateSelect({ value, retentionDays, onChange, radius = 3 }: DateSelectProps) {
  const today = new Date().toISOString().slice(0, 10)
  const days = daysAround(today, radius)

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">Date</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        aria-label="Date"
      >
        {days.map((day) => {
          const enabled = day >= addDays(today, -retentionDays) && day <= today
          return (
            <option key={day} value={day} disabled={!enabled}>
              {day}
              {enabled ? "" : " (expired)"}
            </option>
          )
        })}
      </select>
    </label>
  )
}
```

- [ ] **Step 2: Run client tests**

Run: `cd web-app && npx vitest run`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add web-app/src/components/DateSelect.tsx
git commit -m "feat(web-app): update DateSelect to use retention window"
```

---

### Task 10: Cleanup — Remove mock fixtures

**Files:**
- Delete: `web-app/src/hooks/useTimelineFixtures.ts`
- Delete: `web-app/src/hooks/__tests__/useTimelineFixtures.test.ts`
- Delete: `web-app/public/fixtures/sample.mp4`
- Delete: `web-app/public/fixtures/timeline-coverage.json`
- Modify: `web-app/src/lib/timeline.ts`

- [ ] **Step 1: Remove `TimelineCoverageFile` type from `timeline.ts`**

Delete these lines from `web-app/src/lib/timeline.ts`:

```ts
export type TimelineCoverageFile = {
  day: string
  cameras: Record<string, { ranges: TimeRange[] }>
}
```

- [ ] **Step 2: Delete fixture files**

```bash
rm web-app/public/fixtures/sample.mp4
rm web-app/public/fixtures/timeline-coverage.json
rmdir web-app/public/fixtures
```

- [ ] **Step 3: Delete useTimelineFixtures hook and test**

```bash
rm web-app/src/hooks/useTimelineFixtures.ts
rm web-app/src/hooks/__tests__/useTimelineFixtures.test.ts
```

- [ ] **Step 4: Run client tests**

Run: `cd web-app && npx vitest run`
Expected: all tests pass (no references to deleted files)

- [ ] **Step 5: Commit**

```bash
git add -A web-app/
git commit -m "chore(web-app): remove mock timeline fixtures and useTimelineFixtures hook"
```

---

### Task 11: Verify — Full smoke test

- [ ] **Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: all tests pass

- [ ] **Step 2: Run all client tests**

Run: `cd web-app && npx vitest run`
Expected: all tests pass

- [ ] **Step 3: Build client**

Run: `cd web-app && npm run build`
Expected: builds without errors

- [ ] **Step 4: Commit (if any fixes needed)**

If any fixes were needed during verification, commit them.
