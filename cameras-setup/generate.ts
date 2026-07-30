import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { loadConfig } from "./config"
import { renderClientCameras, renderGo2rtc } from "./render"

export function generate(root: string) {
  const config = loadConfig(readFileSync(join(root, "cameras.yml"), "utf8"))

  const go2rtcPath = join(root, "go2rtc", "go2rtc.yaml")
  mkdirSync(dirname(go2rtcPath), { recursive: true })
  writeFileSync(go2rtcPath, renderGo2rtc(config))

  console.log(`wrote ${go2rtcPath}`)

  if (process.env.INSTALL_ROOT) return

  const camerasJsonPath = join(root, "web-app", "public", "cameras.json")
  mkdirSync(dirname(camerasJsonPath), { recursive: true })
  writeFileSync(camerasJsonPath, renderClientCameras(config))
  console.log(`wrote ${camerasJsonPath}`)
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..")
  generate(root)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
