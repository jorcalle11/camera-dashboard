import { createServer } from "node:http"
import { describe, expect, it } from "vitest"
import WebSocket from "ws"
import { RecorderManager } from "./recorder/RecorderManager"
import { createStatusServer } from "./websocket"

describe("createStatusServer", () => {
  it("broadcasts status to connected clients", async () => {
    const httpServer = createServer()
    const recorder = new RecorderManager({
      spawnFfmpeg: () => ({ process: { on: () => {}, kill: () => true } as unknown as import("node:child_process").ChildProcess, logPath: "/tmp/x.log" }),
      outputRoot: "/recordings",
    })
    const { broadcast } = createStatusServer(httpServer, recorder, () => ({ totalBytes: 1, freeBytes: 1, usedBytes: 0 }))
    httpServer.listen(0)
    const port = (httpServer.address() as import("node:net").AddressInfo).port

    const client = new WebSocket(`ws://localhost:${port}/api/ws`)
    await new Promise<void>((resolve, reject) => {
      client.on("open", resolve)
      client.on("error", reject)
    })

    const msgPromise = new Promise<string>((resolve) => client.once("message", (data) => resolve(data.toString())))
    broadcast()
    const msg = await msgPromise
    const parsed = JSON.parse(msg)
    expect(parsed.type).toBe("status")
    expect(parsed).toHaveProperty("cameras")
    client.close()
    httpServer.close()
  })
})
