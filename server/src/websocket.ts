import type { Server as HttpServer } from "node:http"
import { WebSocketServer } from "ws"
import type { RecorderManager } from "./recorder/RecorderManager"

export interface DiskInfo {
  totalBytes: number
  freeBytes: number
  usedBytes: number
}

export function createStatusServer(
  server: HttpServer,
  recorderManager: RecorderManager,
  getDiskInfo: () => DiskInfo,
) {
  const wss = new WebSocketServer({ server, path: "/api/ws" })

  const broadcast = () => {
    const payload = JSON.stringify({
      type: "status",
      cameras: recorderManager.status(),
      disk: getDiskInfo(),
    })
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(payload)
    }
  }

  recorderManager.on("status", broadcast)
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "status", cameras: recorderManager.status(), disk: getDiskInfo() }))
  })

  return { broadcast }
}
