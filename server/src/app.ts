import express from "express"
import type Database from "better-sqlite3"
import { camerasRouter } from "./routes/cameras"
import { recordingsRouter } from "./routes/recordings"
import { snapshotsRouter } from "./routes/snapshots"
import { systemRouter } from "./routes/system"
import type { CameraStatus } from "./recorder/RecorderManager"

export interface AppDeps {
  db: Database.Database
  dbPath: string
  recordingsRoot: string
  go2rtcUrl: string
  recorderStatus: () => Record<string, CameraStatus>
}

export function createApp(deps: AppDeps): express.Express {
  const app = express()
  app.use(express.json())

  app.use("/api", camerasRouter({ db: deps.db, go2rtcUrl: deps.go2rtcUrl, recorderStatus: deps.recorderStatus }))
  app.use("/api", recordingsRouter({ db: deps.db }))
  app.use("/api", systemRouter({ db: deps.db, dbPath: deps.dbPath, recordingsRoot: deps.recordingsRoot, recorderStatus: deps.recorderStatus }))
  app.use("/api", snapshotsRouter({ db: deps.db, recordingsRoot: deps.recordingsRoot }))
  app.use("/recordings", express.static(deps.recordingsRoot))

  return app
}
