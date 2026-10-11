import type Database from "better-sqlite3"
import { globSync } from "node:fs"
import { statSync } from "node:fs"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import chokidar from "chokidar"

const execFileAsync = promisify(execFile)

const FALLBACK_DURATION_MS = 60_000
const PROBE_CONCURRENCY = 8

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

async function probeDurationMs(path: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
      { timeout: 10_000, windowsHide: true },
    )
    const seconds = Number.parseFloat(stdout.trim())
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000)
  } catch {
    // unreadable or still-growing file — fall back to the nominal segment length
  }
  return FALLBACK_DURATION_MS
}

export async function probeSegment(path: string): Promise<SegmentProbe> {
  const { size } = statSync(path)
  const durationMs = await probeDurationMs(path)
  return { durationMs, sizeBytes: size }
}

export interface IndexSegmentsOptions {
  db: Database.Database
  recordingsRoot: string
  probeFn?: (path: string) => Promise<SegmentProbe>
}

export async function indexSegments(opts: IndexSegmentsOptions): Promise<void> {
  const { db, recordingsRoot, probeFn = probeSegment } = opts
  const insert = db.prepare(
    `INSERT INTO segments (camera_id, start_ts, duration_ms, path, size_bytes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET duration_ms=excluded.duration_ms, size_bytes=excluded.size_bytes`,
  )
  const deleteStmt = db.prepare("DELETE FROM segments WHERE path = ?")

  const pattern = join(recordingsRoot, "*", "*", "*.mp4")
  const paths = globSync(pattern)
  const onDisk = new Set<string>()

  let cursor = 0
  const workers = Array.from({ length: Math.min(PROBE_CONCURRENCY, paths.length) }, async () => {
    while (cursor < paths.length) {
      const fullPath = paths[cursor++]!
      const rel = fullPath.slice(recordingsRoot.length + 1)
      const parsed = parseSegmentPath(rel)
      if (!parsed) continue
      const probe = await probeFn(fullPath)
      insert.run(parsed.cameraId, parsed.startTs, probe.durationMs, rel, probe.sizeBytes)
      onDisk.add(rel)
    }
  })
  await Promise.all(workers)

  const rows = db.prepare("SELECT path FROM segments").all() as { path: string }[]
  for (const { path } of rows) {
    if (!onDisk.has(path)) deleteStmt.run(path)
  }
}

export interface WatchSegmentsOptions {
  db: Database.Database
  recordingsRoot: string
  probeFn?: (path: string) => Promise<SegmentProbe>
}

export async function upsertSegmentFromPath(
  db: Database.Database,
  recordingsRoot: string,
  relativePath: string,
  probeFn: (path: string) => Promise<SegmentProbe> = probeSegment,
): Promise<boolean> {
  const parsed = parseSegmentPath(relativePath)
  if (!parsed) return false
  const insert = db.prepare(
    `INSERT INTO segments (camera_id, start_ts, duration_ms, path, size_bytes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET duration_ms=excluded.duration_ms, size_bytes=excluded.size_bytes`,
  )
  const probe = await probeFn(join(recordingsRoot, relativePath))
  insert.run(parsed.cameraId, parsed.startTs, probe.durationMs, relativePath, probe.sizeBytes)
  return true
}

export function watchSegments(opts: WatchSegmentsOptions): chokidar.FSWatcher {
  const { db, recordingsRoot, probeFn = probeSegment } = opts

  const watcher = chokidar.watch(join(recordingsRoot, "*", "*", "*.mp4"), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000 },
  })

  // awaitWriteFinish means `add` fires after the segment file stops growing,
  // so this is the completed file — not a guessed previous 60s path.
  watcher.on("add", (fullPath) => {
    const rel = fullPath.slice(recordingsRoot.length + 1)
    void upsertSegmentFromPath(db, recordingsRoot, rel, probeFn).catch(() => {
      // file may have been deleted between the event and the probe
    })
  })

  return watcher
}