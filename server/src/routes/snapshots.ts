import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { Router } from "express"
import type Database from "better-sqlite3"
import { getRtspUrl } from "../lib/go2rtc"

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
      "-i", getRtspUrl(cameraId),
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
      const stats = await stat(outPath)
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
