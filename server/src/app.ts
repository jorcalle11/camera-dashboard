import express from "express"
import { pinoHttp } from "pino-http"
import { camerasRouter } from "./routes/cameras"
import { logger } from "./logger"
import { healthRouter } from "./routes/health"
import { recordingsRouter } from "./routes/recordings"
import { snapshotsRouter } from "./routes/snapshots"
import { systemRouter } from "./routes/system"
import { vodRouter } from "./routes/vod"
import type { CameraStatus } from "./recorder/RecorderManager"
import type { Database } from "better-sqlite3"

export interface AppDeps {
  db: Database
  dbPath?: string
  recordingsRoot: string
  go2rtcUrl?: string
  recorderStatus?: () => Record<string, CameraStatus>
}

export function createApp(deps: AppDeps): express.Express {
  const app = express()
  app.use(pinoHttp({ logger }))
  app.use(express.json())

  app.use("/api", healthRouter({ db: deps.db }))
  app.use("/api/cameras", camerasRouter({ db: deps.db, go2rtcUrl: deps.go2rtcUrl, recorderStatus: deps.recorderStatus }))
  app.use("/api/cameras/:id/recordings", recordingsRouter({ db: deps.db }))
  app.use("/api/recordings/:camera", vodRouter({ db: deps.db }))
  app.use("/api/cameras/:id/snapshots", snapshotsRouter({ db: deps.db }))
  app.use("/api/system", systemRouter({ db: deps.db, dbPath: deps.dbPath, recordingsRoot: deps.recordingsRoot, recorderStatus: deps.recorderStatus }))
  app.use("/api/statics/recordings", express.static(deps.recordingsRoot))
  return app
}
