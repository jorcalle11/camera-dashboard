import { Router } from "express"
import type Database from "better-sqlite3"
import { statfsSync, statSync } from "node:fs"
import type { CameraStatus } from "../recorder/RecorderManager"

export interface SystemDeps {
  db: Database.Database
  dbPath: string
  recordingsRoot: string
  recorderStatus: () => Record<string, CameraStatus>
}

export function systemRouter(deps: SystemDeps): Router {
  const { db, dbPath, recordingsRoot, recorderStatus } = deps
  const router = Router()

  router.get("/system/status", (_req, res) => {
    const stats = statfsSync(recordingsRoot)
    const total = stats.bsize * stats.blocks
    const free = stats.bsize * stats.bfree
    const used = total - free

    const cameras = db.prepare("SELECT id, name, enabled FROM cameras").all() as { id: string; name: string; enabled: number }[]
    const status = recorderStatus()
    const cameraStatus = cameras.map((c) => ({
      id: c.id,
      name: c.name,
      enabled: Boolean(c.enabled),
      ...(status[c.id] ?? { state: "stopped", restarts: 0, restartedAt: null }),
    }))

    res.json({
      disk: { totalBytes: total, freeBytes: free, usedBytes: used },
      cameras: cameraStatus,
      dbSizeBytes: statSync(dbPath).size,
    })
  })

  return router
}
