import { unlinkSync, rmdirSync, readdirSync, statfsSync } from "node:fs"
import { join } from "node:path"
import type Database from "better-sqlite3"
import type { CameraConfig } from "../config.js"
import { logger } from "../logger.js"

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
    this.interval = setInterval(() => this.run(), 60 * 60 * 1000)
    logger.info("retention job started (hourly)")
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  run() {
    const { cameras } = this.deps
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
