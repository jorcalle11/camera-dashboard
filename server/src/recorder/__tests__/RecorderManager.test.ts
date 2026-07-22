import { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vitest"
import { RecorderManager } from "../RecorderManager"

function fakeProcess() {
  const proc = new EventEmitter() as unknown as import("node:child_process").ChildProcess
  proc.kill = vi.fn().mockReturnValue(true)
  return proc
}

describe("RecorderManager", () => {
  it("starts a camera and emits recording status", async () => {
    const spawn = vi.fn().mockReturnValue({ process: fakeProcess(), logPath: "/tmp/cam1.log" })
    const mgr = new RecorderManager({ spawnFfmpeg: spawn, outputRoot: "/recordings", baseBackoffMs: 10 })
    mgr.start({ id: "cam1", name: "Front Door", url: "rtsp://go2rtc:8554/cam1", enabled: true, retentionDays: 7 })
    await new Promise((r) => setTimeout(r, 5))
    expect(spawn).toHaveBeenCalledWith("cam1", "/recordings/cam1")
    const status = mgr.status()
    expect(status.cam1.state).toBe("recording")
  })

  it("retries on exit with backoff", async () => {
    const proc1 = fakeProcess()
    const proc2 = fakeProcess()
    const spawn = vi.fn().mockReturnValueOnce({ process: proc1, logPath: "/tmp/cam1.log" }).mockReturnValueOnce({ process: proc2, logPath: "/tmp/cam1.log" })
    const mgr = new RecorderManager({ spawnFfmpeg: spawn, outputRoot: "/recordings", baseBackoffMs: 10 })
    mgr.start({ id: "cam1", name: "Front Door", url: "rtsp://go2rtc:8554/cam1", enabled: true, retentionDays: 7 })
    await new Promise((r) => setTimeout(r, 5))
    proc1.emit("exit", 1)
    await new Promise((r) => setTimeout(r, 25))
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(mgr.status().cam1.state).toBe("recording")
  })

  it("stops a camera and does not restart", async () => {
    const proc = fakeProcess()
    const spawn = vi.fn().mockReturnValue({ process: proc, logPath: "/tmp/cam1.log" })
    const mgr = new RecorderManager({ spawnFfmpeg: spawn, outputRoot: "/recordings", baseBackoffMs: 10 })
    mgr.start({ id: "cam1", name: "Front Door", url: "rtsp://go2rtc:8554/cam1", enabled: true, retentionDays: 7 })
    await new Promise((r) => setTimeout(r, 5))
    mgr.stop("cam1")
    expect(proc.kill).toHaveBeenCalled()
    proc.emit("exit", 0)
    await new Promise((r) => setTimeout(r, 25))
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(mgr.status().cam1.state).toBe("stopped")
  })
})
