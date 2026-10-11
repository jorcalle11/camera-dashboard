import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadServerConfig, syncCameras } from "./config.js"
import { getDb, migrate } from "./db.js"

const YAML = `
webrtc_candidate: \${HOST_IP}:8555
cameras:
  - id: cam1
    name: Front Door
    url: \${CAM1_RTSP_URL}
    enabled: true
    retention_days: 7
`

describe("loadServerConfig", () => {
  it("parses cameras.yml", () => {
    const cfg = loadServerConfig(YAML)
    expect(cfg.webrtcCandidate).toBe("${HOST_IP}:8555")
    expect(cfg.cameras).toEqual([
      { id: "cam1", name: "Front Door", url: "${CAM1_RTSP_URL}", enabled: true, retentionDays: 7, retentionMaxSizeGb: 50 },
    ])
  })

  it("rejects invalid config", () => {
    expect(() => loadServerConfig("cameras: []")).toThrow(/at least one camera/i)
  })
})

describe("syncCameras", () => {
  let dir: string
  let db: ReturnType<typeof getDb>
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nvr-cfg-"))
    db = getDb(join(dir, "nvr.db"))
    migrate(db)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("inserts cameras from config", () => {
    const cfg = loadServerConfig(YAML)
    syncCameras(db, cfg)
    const row = db.prepare("SELECT id, name, enabled FROM cameras WHERE id=?").get("cam1") as {
      id: string
      name: string
      enabled: number
    }
    expect(row).toEqual({ id: "cam1", name: "Front Door", enabled: 1 })
  })

const YAML2 = `
webrtc_candidate: \${HOST_IP}:8555
cameras:
  - id: cam2
    name: Back
    url: \${CAM2_RTSP_URL}
    enabled: true
    retention_days: 7
`
  it("deletes cameras removed from config", () => {
    const cfg = loadServerConfig(YAML)
    syncCameras(db, cfg)
    const cfg2 = loadServerConfig(YAML2)
    syncCameras(db, cfg2)
    const rows = db.prepare("SELECT id FROM cameras ORDER BY id").all() as { id: string }[]
    expect(rows).toEqual([{ id: "cam2" }])
  })
})
