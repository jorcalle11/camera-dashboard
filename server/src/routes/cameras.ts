import { Router } from "express"
import type Database from "better-sqlite3"
import { env, getRtspUrl } from "../env"
import type { CameraStatus } from "../recorder/RecorderManager"

export interface CameraRouteDeps {
  db: Database.Database
  go2rtcUrl?: string
  recorderStatus?: () => Record<string, CameraStatus>
}

export function camerasRouter(deps: CameraRouteDeps): Router {
  const { db, go2rtcUrl = env.GO2RTC_URL, recorderStatus = (): Record<string, CameraStatus> => ({}) } = deps
  const router = Router({ mergeParams: true })

  router.get("/", (_req, res) => {
    const status = recorderStatus()
    const rows = db.prepare("SELECT id, name, enabled FROM cameras ORDER BY id").all() as { id: string; name: string; enabled: number }[]
    const out = rows.map((row) => {
      const s = status[row.id] ?? { state: "stopped", restarts: 0, restartedAt: null }
      return {
        id: row.id,
        name: row.name,
        enabled: Boolean(row.enabled),
        state: s.state,
        restarts: s.restarts,
        restartedAt: s.restartedAt,
      }
    })
    res.json(out)
  })

  router.get("/:id/latest.jpg", async (req, res) => {
    const cameraId = (req.params as { id: string }).id
    const camera = db.prepare("SELECT id FROM cameras WHERE id=?").get(cameraId)
    if (!camera) return res.status(404).end()
    try {
      const url = `${go2rtcUrl}/api/frame.jpeg?src=${encodeURIComponent(cameraId)}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`go2rtc returned ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      res.set("Content-Type", "image/jpeg")
      res.send(buffer)
    } catch (err) {
      res.status(502).json({ error: (err as Error).message })
    }
  })

  return router
}
