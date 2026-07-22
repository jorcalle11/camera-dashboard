import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import { createApp } from "../../app"
import { getDb, migrate } from "../../db"

describe("cameras routes", () => {
  let dir: string
  let db: ReturnType<typeof getDb>
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nvr-cam-"))
    db = getDb(join(dir, "nvr.db"))
    migrate(db)
    db.prepare("INSERT INTO cameras (id, name, enabled, created_at) VALUES (?, ?, ?, ?)").run("cam1", "Front Door", 1, Date.now())
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("lists cameras with recorder state", async () => {
    const app = createApp({ db, dbPath: join(dir, "nvr.db"), recordingsRoot: dir, go2rtcUrl: "http://go2rtc:1984", recorderStatus: () => ({ cam1: { state: "recording", restarts: 0, restartedAt: null } }) })
    const res = await request(app).get("/api/cameras").expect(200)
    expect(res.body).toEqual([
      { id: "cam1", name: "Front Door", enabled: true, state: "recording", restarts: 0, restartedAt: null },
    ])
  })
})
