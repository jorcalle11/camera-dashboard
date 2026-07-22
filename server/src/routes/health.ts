import { Router } from "express"
import type Database from "better-sqlite3"

export interface HealthDeps {
  db: Database.Database
}

export function healthRouter(deps: HealthDeps): Router {
  const { db } = deps
  const router = Router()

  router.get("/", (_req, res) => {
    res.json({ ok: true, service: "camera-dashboard-server" })
  })

  router.get("/health", (_req, res) => {
    try {
      db.prepare("SELECT 1").get()
      res.json({ status: "healthy", db: "ok" })
    } catch (err) {
      res.status(503).json({ status: "unhealthy", db: (err as Error).message })
    }
  })

  return router
}
