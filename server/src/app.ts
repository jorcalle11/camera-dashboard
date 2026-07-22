import express from "express"
import { camerasRouter } from "./routes/cameras"
import { healthRouter } from "./routes/health"
import { recordingsRouter } from "./routes/recordings"
import { snapshotsRouter } from "./routes/snapshots"
import { systemRouter } from "./routes/system"
import type { CameraStatus } from "./recorder/RecorderManager"

export interface AppDeps {
  db: import("better-sqlite3").Database
  dbPath?: string
  recordingsRoot?: string
  go2rtcUrl?: string
  recorderStatus?: () => Record<string, CameraStatus>
}

export function createApp(deps: AppDeps): express.Express {
  const app = express()
  app.use(express.json())

  app.use("/api", healthRouter({ db: deps.db }))
  app.use("/api/cameras", camerasRouter({ db: deps.db, go2rtcUrl: deps.go2rtcUrl, recorderStatus: deps.recorderStatus }))
  app.use("/api/cameras/:id/recordings", recordingsRouter({ db: deps.db }))
  app.use("/api/cameras/:id/snapshots", snapshotsRouter({ db: deps.db }))
  app.use("/api/system", systemRouter({ db: deps.db, dbPath: deps.dbPath, recordingsRoot: deps.recordingsRoot, recorderStatus: deps.recorderStatus }))
  app.use("/api/statics/recordings", express.static(deps.recordingsRoot ?? process.env.RECORDINGS_PATH ?? "/recordings"))

  return app
}
