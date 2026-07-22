import { parse } from "yaml"
import type Database from "better-sqlite3"

export interface CameraConfig {
  id: string
  name: string
  url: string
  enabled: boolean
  retentionDays: number
}

export interface AppConfig {
  webrtcCandidate: string
  cameras: CameraConfig[]
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export function loadServerConfig(yamlText: string): AppConfig {
  const raw = parse(yamlText) as unknown
  if (typeof raw !== "object" || raw === null) throw new Error("config must be a YAML mapping")
  const doc = raw as Record<string, unknown>

  if (!Array.isArray(doc.cameras) || doc.cameras.length === 0)
    throw new Error("config must define at least one camera")
  if (typeof doc.webrtc_candidate !== "string" || doc.webrtc_candidate.length === 0)
    throw new Error("webrtc_candidate must be a non-empty string")

  const seen = new Set<string>()
  const cameras = doc.cameras.map((entry, i) => {
    const cam = entry as Record<string, unknown>
    if (typeof cam.id !== "string" || !ID_PATTERN.test(cam.id))
      throw new Error(`cameras[${i}]: id must be a lowercase slug (got ${JSON.stringify(cam.id)})`)
    if (seen.has(cam.id)) throw new Error(`duplicate camera id: ${cam.id}`)
    seen.add(cam.id)
    if (typeof cam.name !== "string" || cam.name.length === 0)
      throw new Error(`cameras[${i}]: name must be a non-empty string`)
    if (typeof cam.url !== "string" || cam.url.length === 0)
      throw new Error(`cameras[${i}]: url must be a non-empty string`)
    if (typeof cam.enabled !== "boolean")
      throw new Error(`cameras[${i}]: enabled must be a boolean`)
    if (typeof cam.retention_days !== "number" || cam.retention_days < 1)
      throw new Error(`cameras[${i}]: retention_days must be a number >= 1`)
    return {
      id: cam.id,
      name: cam.name,
      url: cam.url,
      enabled: cam.enabled,
      retentionDays: cam.retention_days,
    }
  })

  return { webrtcCandidate: doc.webrtc_candidate, cameras }
}

export function syncCameras(db: Database.Database, config: AppConfig): void {
  const insert = db.prepare(
    `INSERT INTO cameras (id, name, enabled, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, enabled=excluded.enabled`,
  )
  const now = Date.now()
  for (const cam of config.cameras) {
    insert.run(cam.id, cam.name, cam.enabled ? 1 : 0, now)
  }
}
