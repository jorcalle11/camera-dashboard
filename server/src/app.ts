import express, { type Application } from "express"
import { snapshotsRouter } from "./routes/snapshots"

export interface AppDeps {
  db: import("better-sqlite3").Database
  recordingsRoot: string
  go2rtcUrl: string
  recorderStatus: () => Record<string, unknown>
}

export function createApp(deps: AppDeps): Application {
  const app = express()
  app.use(express.json())
  app.use("/api", snapshotsRouter({
    db: deps.db,
    recordingsRoot: deps.recordingsRoot,
  }))
  return app
}
