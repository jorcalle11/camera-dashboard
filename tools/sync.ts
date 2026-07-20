import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse, stringify } from "yaml"

/** cameras.yml entry in its on-disk (snake_case) shape. */
export interface RawCameraEntry {
  id: string
  name: string
  url: string
  enabled: boolean
  retention_days: number
}

const CAM_KEY_PATTERN = /^CAM(\d+)_RTSP_URL$/

/** Extract CAMn_RTSP_URL keys from a list of env var names, sorted by camera number. */
export function cameraEnvKeys(envKeys: string[]): string[] {
  return envKeys
    .map((key) => {
      const match = CAM_KEY_PATTERN.exec(key)
      return match ? { key, n: Number(match[1]) } : null
    })
    .filter((entry): entry is { key: string; n: number } => entry !== null)
    .sort((a, b) => a.n - b.n)
    .map((entry) => entry.key)
}

export interface SyncResult {
  cameras: RawCameraEntry[]
  added: string[]
  removed: string[]
}

/**
 * Sync camera entries against the CAMn_RTSP_URL vars present in .env:
 * - new env var -> add entry (id camN, name "Camera N", enabled, 7 days retention)
 * - existing entry whose ${CAMn_RTSP_URL} still exists -> preserved verbatim
 * - entry referencing a removed env var -> dropped
 * - entries with custom urls (no ${CAMn_RTSP_URL} placeholder) -> preserved verbatim
 */
export function syncCameras(envKeys: string[], existing: RawCameraEntry[]): SyncResult {
  const keys = cameraEnvKeys(envKeys)
  const keySet = new Set(keys)

  const added: string[] = []
  const removed: string[] = []

  const kept = existing.filter((cam) => {
    const match = /^\$\{(CAM\d+_RTSP_URL)\}$/.exec(cam.url)
    if (match && !keySet.has(match[1])) {
      removed.push(cam.id)
      return false
    }
    return true
  })

  const referenced = new Set(
    kept
      .map((cam) => /^\$\{(CAM\d+_RTSP_URL)\}$/.exec(cam.url)?.[1])
      .filter((key): key is string => key !== undefined),
  )

  const cameras = [...kept]
  for (const key of keys) {
    if (referenced.has(key)) continue
    const n = CAM_KEY_PATTERN.exec(key)![1]
    const id = `cam${n}`
    cameras.push({
      id,
      name: `Camera ${n}`,
      url: `\${${key}}`,
      enabled: true,
      retention_days: 7,
    })
    added.push(id)
  }

  return { cameras, added, removed }
}

/** Parse the names of the variables defined in a dotenv-style file. */
export function envKeysFromFile(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")).trim())
}

const CAMERAS_YML_HEADER = `# Single source of truth for cameras.
# Managed by \`npm run sync\` (from .env) — manual edits to name/enabled/
# retention_days are preserved; url values reference env vars resolved by
# go2rtc at runtime. Never put credentials in this file.
`

interface CamerasDoc {
  webrtc_candidate?: string
  cameras?: RawCameraEntry[]
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..")

  let envText: string
  try {
    envText = readFileSync(join(root, ".env"), "utf8")
  } catch {
    console.error("error: .env not found — copy .env.example to .env first")
    process.exit(1)
  }

  const camerasYmlPath = join(root, "cameras.yml")
  let doc: CamerasDoc = {}
  try {
    doc = (parse(readFileSync(camerasYmlPath, "utf8")) as CamerasDoc) ?? {}
  } catch {
    // no cameras.yml yet — start fresh
  }

  const { cameras, added, removed } = syncCameras(envKeysFromFile(envText), doc.cameras ?? [])

  if (cameras.length === 0) {
    console.error("error: no CAMn_RTSP_URL variables found in .env — nothing to sync")
    process.exit(1)
  }

  const out = {
    webrtc_candidate: doc.webrtc_candidate ?? "${HOST_IP}:8555",
    cameras,
  }
  writeFileSync(camerasYmlPath, CAMERAS_YML_HEADER + stringify(out))

  for (const id of added) console.log(`added   ${id}`)
  for (const id of removed) console.log(`removed ${id}`)
  console.log(`synced ${cameras.length} camera(s) -> cameras.yml`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
