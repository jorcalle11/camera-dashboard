import Database from "better-sqlite3"
import { join } from "node:path"

const dbPath = join(process.env.DATA_PATH ?? "/data", "nvr.db")
const db = new Database(dbPath)

const cameras = db.prepare("SELECT * FROM cameras").all()
console.table(cameras)

db.close()
