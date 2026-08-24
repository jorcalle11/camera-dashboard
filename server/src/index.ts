import { mkdirSync, readFileSync, statfsSync } from "node:fs"
import { createServer } from "node:http"
import { createApp } from "./app.js"
import { loadServerConfig, syncCameras } from "./config.js"
import { getDb, migrate } from "./db.js"
import { env } from "./env.js"
import { ensurePreload, ensurePreloads, waitForGo2rtc } from "./go2rtc.js"
import { logger } from "./logger.js"
import { spawnFfmpeg } from "./recorder/ffmpeg.js"
import { indexSegments, watchSegments } from "./recorder/indexer.js"
import { RecorderManager } from "./recorder/RecorderManager.js"
import { RetentionJob } from "./recorder/RetentionJob.js"
import { createStatusServer } from "./websocket.js"

async function main() {
  mkdirSync(env.DATA_PATH, { recursive: true })

  const db = getDb(env.DB_PATH)
  migrate(db)

  const yamlText = readFileSync(env.CAMERAS_YML_PATH, "utf8")
  const config = loadServerConfig(yamlText)
  syncCameras(db, config)

  indexSegments({ db, recordingsRoot: env.RECORDINGS_PATH })
  const watcher = watchSegments({ db, recordingsRoot: env.RECORDINGS_PATH })

  const enabledCameras = config.cameras.filter((cam) => cam.enabled)
  await waitForGo2rtc(env.GO2RTC_URL)
  await ensurePreloads(env.GO2RTC_URL, enabledCameras.map((cam) => cam.id))

  const recorder = new RecorderManager({
    spawnFfmpeg,
    outputRoot: env.RECORDINGS_PATH,
    onBeforeSpawn: (cameraId) => ensurePreload(env.GO2RTC_URL, cameraId),
  })
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
  const { broadcast } = createStatusServer(server, recorder, () => {
    const { bsize, blocks, bfree } = statfsSync(env.RECORDINGS_PATH)
    const total = bsize * blocks
    const free = bsize * bfree
    return { totalBytes: total, freeBytes: free, usedBytes: total - free }
  })

  const retention = new RetentionJob({
    db,
    recordingsRoot: env.RECORDINGS_PATH,
    cameras: config.cameras,
    diskFreeThresholdGb: env.DISK_FREE_THRESHOLD_GB,
    broadcast,
  })
  retention.start()

  function shutdown() {
    logger.info("shutting down...")
    retention.stop()
    recorder.stopAll()
    watcher.close().catch(() => {})
    server.close(() => process.exit(0))
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)

  server.listen(env.PORT, "0.0.0.0", () => {
    logger.info(`server listening on port ${env.PORT}`)
  })
}

main().catch((err) => {
  logger.error(err, "server failed to start")
  process.exit(1)
})
