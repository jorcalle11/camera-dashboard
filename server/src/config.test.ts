import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadServerConfig, syncCameras } from "./config"
import { getDb, migrate } from "./db"

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
      { id: "cam1", name: "Front Door", url: "${CAM1_RTSP_URL}", enabled: true, retentionDays: 7 },
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

  it("updates names and disables missing cameras", () => {
    const cfg = loadServerConfig(YAML)
    syncCameras(db, cfg)
    const updated = loadServerConfig(YAML.replace("Front Door", "Porch"))
    syncCameras(db, updated)
    const row = db.prepare("SELECT name, enabled FROM cameras WHERE id=?").get("cam1") as {
      name: string
      enabled: number
    }
    expect(row.name).toBe("Porch")
    expect(row.enabled).toBe(1)
  })
})
