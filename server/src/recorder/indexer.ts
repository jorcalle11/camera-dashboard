import type Database from "better-sqlite3"
import { globSync } from "node:fs"
import { statSync } from "node:fs"
import { join } from "node:path"
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
  probeFn?: (path: string) => SegmentProbe
}

export function upsertSegmentFromPath(
  db: Database.Database,
  recordingsRoot: string,
  relativePath: string,
  probeFn: (path: string) => SegmentProbe = probeSegment,
): boolean {
  const parsed = parseSegmentPath(relativePath)
  if (!parsed) return false
  const insert = db.prepare(
    `INSERT INTO segments (camera_id, start_ts, duration_ms, path, size_bytes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET duration_ms=excluded.duration_ms, size_bytes=excluded.size_bytes`,
  )
  const probe = probeFn(join(recordingsRoot, relativePath))
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
    try {
      upsertSegmentFromPath(db, recordingsRoot, rel, probeFn)
    } catch {
      // file may have been deleted between the event and the probe
    }
  })

  return watcher
}
