import Database from "better-sqlite3"
import { readFileSync } from "node:fs"
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
  const migration = readFileSync(join(migrationsDir, "001-initial.sql"), "utf8")
  if (!applied.has(1)) {
    db.exec(migration)
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(1, Date.now())
  }
}
