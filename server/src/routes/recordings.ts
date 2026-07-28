import { Router } from "express"
import type Database from "better-sqlite3"

export interface RecordingsDeps {
  db: Database.Database
}

export function recordingsRouter(deps: RecordingsDeps): Router {
  const { db } = deps
  const router = Router({ mergeParams: true })

  router.get("/", (req, res) => {
    const camera = (req.params as { id: string }).id
    const from = req.query.from ? Number(req.query.from) : 0
    const to = req.query.to ? Number(req.query.to) : Date.now()

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

  return router
}
