import Database from "better-sqlite3"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getDb, migrate } from "../../db.js"
import { indexSegments, parseSegmentPath, probeSegment, upsertSegmentFromPath } from "../indexer.js"

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
  let db: ReturnType<typeof getDb>
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

describe("upsertSegmentFromPath", () => {
  it("indexes the completed file, not a guessed previous path", () => {
    const dir = mkdtempSync(join(tmpdir(), "nvr-upsert-"))
    const db = getDb(join(dir, "nvr.db"))
    migrate(db)
    db.prepare("INSERT INTO cameras (id, name, enabled, created_at) VALUES (?, ?, ?, ?)").run("cam1", "Front Door", 1, Date.now())
    const recDir = join(dir, "recordings", "cam1", "2026-08-26")
    mkdirSync(recDir, { recursive: true })
    writeFileSync(join(recDir, "19-53-01.mp4"), Buffer.alloc(2048))
    const ok = upsertSegmentFromPath(db, join(dir, "recordings"), "cam1/2026-08-26/19-53-01.mp4", () => ({
      durationMs: 60000,
      sizeBytes: 2048,
    }))
    expect(ok).toBe(true)
    const rows = db.prepare("SELECT path FROM segments").all() as { path: string }[]
    expect(rows).toEqual([{ path: "cam1/2026-08-26/19-53-01.mp4" }])
    rmSync(dir, { recursive: true, force: true })
  })
})
