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
