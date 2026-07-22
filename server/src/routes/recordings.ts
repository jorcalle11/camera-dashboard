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
