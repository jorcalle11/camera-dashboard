import { mkdirSync, readFileSync, statfsSync } from "node:fs"
import { createServer } from "node:http"
import { createApp } from "./app"
import { loadServerConfig, syncCameras } from "./config"
import { getDb, migrate } from "./db"
import { env } from "./env"
import { spawnFfmpeg } from "./recorder/ffmpeg"
import { indexSegments, watchSegments } from "./recorder/indexer"
import { logger } from "./logger"
import { RecorderManager } from "./recorder/RecorderManager"
import { RetentionJob } from "./recorder/RetentionJob"
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

const retention = new RetentionJob({
  db,
  recordingsRoot: env.RECORDINGS_PATH,
  cameras: config.cameras,
  diskFreeThresholdGb: env.DISK_FREE_THRESHOLD_GB,
})

const app = createApp({
  db,
  dbPath: env.DB_PATH,
  recordingsRoot: env.RECORDINGS_PATH,
  go2rtcUrl: env.GO2RTC_URL,
  recorderStatus: () => recorder.status(),
})

const server = createServer(app)
const { broadcast } = createStatusServer(server, recorder, () => {
  const { bsize, blocks, bfree } = statfsSync(env.RECORDINGS_PATH)
  const total = bsize * blocks
  const free = bsize * bfree
  return { totalBytes: total, freeBytes: free, usedBytes: total - free }
})

retention.broadcast = broadcast
retention.start()

server.listen(env.PORT, "0.0.0.0", () => {
  logger.info(`server listening on port ${env.PORT}`)
})

function shutdown() {
  logger.info("shutting down...")
  retention.stop()
  recorder.stopAll()
  watcher.close().catch(() => {})
  server.close(() => process.exit(0))
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
