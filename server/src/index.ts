import { mkdirSync, readFileSync, statfsSync } from "node:fs"
import { createServer } from "node:http"
import { createApp } from "./app"
import { loadServerConfig, syncCameras } from "./config"
import { getDb, migrate } from "./db"
import { env } from "./env"
import { spawnFfmpeg } from "./recorder/ffmpeg"
import { indexSegments, watchSegments } from "./recorder/indexer"
import { RecorderManager } from "./recorder/RecorderManager"
import { createStatusServer } from "./websocket"

mkdirSync(env.DATA_PATH, { recursive: true })

const db = getDb(env.DB_PATH)
migrate(db)

const yamlText = readFileSync(env.CAMERAS_YML_PATH, "utf8")
const config = loadServerConfig(yamlText)
syncCameras(db, config)

indexSegments({ db, recordingsRoot: env.RECORDINGS_PATH })
const watcher = watchSegments({ db, recordingsRoot: env.RECORDINGS_PATH })

const recorder = new RecorderManager({ spawnFfmpeg, outputRoot: env.RECORDINGS_PATH })
for (const camera of config.cameras) {
  recorder.start(camera)
}

const app = createApp({
  db,
  dbPath: env.DB_PATH,
  recordingsRoot: env.RECORDINGS_PATH,
  go2rtcUrl: env.GO2RTC_URL,
  recorderStatus: () => recorder.status(),
})

const server = createServer(app)
createStatusServer(server, recorder, () => {
  const { bsize, blocks, bfree } = statfsSync(env.RECORDINGS_PATH)
  const total = bsize * blocks
  const free = bsize * bfree
  return { totalBytes: total, freeBytes: free, usedBytes: total - free }
})

server.listen(env.PORT, "0.0.0.0", () => {
  console.log(`server listening on port ${env.PORT}`)
})

function shutdown() {
  console.log("shutting down...")
  recorder.stopAll()
  watcher.close().catch(() => {})
  server.close(() => process.exit(0))
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
