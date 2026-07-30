import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getDb, migrate } from "./db.js"

describe("migrate", () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nvr-db-"))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("creates expected tables", () => {
    const db = getDb(join(dir, "nvr.db"))
    migrate(db)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain("cameras")
    expect(names).toContain("segments")
    expect(names).toContain("snapshots")
    expect(names).toContain("schema_migrations")
  })

  it("records migration version", () => {
    const db = getDb(join(dir, "nvr.db"))
    migrate(db)
    const row = db.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as { version: number }
    expect(row.version).toBe(1)
  })

  it("is idempotent", () => {
    const db = getDb(join(dir, "nvr.db"))
    migrate(db)
    migrate(db)
    expect(db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as { c: number }).toEqual({ c: 1 })
  })
})
