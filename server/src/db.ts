import Database from "better-sqlite3"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

export function getDb(path: string): Database.Database {
  const db = new Database(path)
  db.pragma("journal_mode = WAL")
  return db
}

export function migrate(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`)

  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version),
  )

  const migrationsDir = join(fileURLToPath(import.meta.url), "..", "migrations")
  const insertMigration = db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const version = Number.parseInt(file, 10)
    if (!Number.isFinite(version) || applied.has(version)) continue
    db.exec(readFileSync(join(migrationsDir, file), "utf8"))
    insertMigration.run(version, Date.now())
  }
}
