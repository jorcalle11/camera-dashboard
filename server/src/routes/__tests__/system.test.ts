import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import { createApp } from "../../app.js"
import { getDb, migrate } from "../../db.js"

describe("system status", () => {
  let dir: string
  let db: ReturnType<typeof getDb>
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nvr-sys-"))
    db = getDb(join(dir, "nvr.db"))
    migrate(db)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("returns disk and recorder info", async () => {
    const app = createApp({ db, dbPath: join(dir, "nvr.db"), recordingsRoot: dir, go2rtcUrl: "http://go2rtc:1984", recorderStatus: () => ({}) })
    const res = await request(app).get("/api/system/status").expect(200)
    expect(res.body).toHaveProperty("disk")
    expect(res.body).toHaveProperty("cameras")
    expect(res.body).toHaveProperty("dbSizeBytes")
  })
})
