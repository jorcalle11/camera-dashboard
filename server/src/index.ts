import { mkdirSync, readFileSync } from "node:fs"
import { createApp } from "./app"
import { loadServerConfig, syncCameras } from "./config"
import { getDb, migrate } from "./db"
import { env } from "./env"

mkdirSync(env.DATA_PATH, { recursive: true })

const db = getDb(env.DB_PATH)
migrate(db)

const yamlText = readFileSync(env.CAMERAS_YML_PATH, "utf8")
const config = loadServerConfig(yamlText)
syncCameras(db, config)

const app = createApp({
  db,
  dbPath: env.DB_PATH,
  recordingsRoot: env.RECORDINGS_PATH,
  go2rtcUrl: env.GO2RTC_URL,
  recorderStatus: () => ({}),
})

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`server listening on port ${env.PORT}`)
})
