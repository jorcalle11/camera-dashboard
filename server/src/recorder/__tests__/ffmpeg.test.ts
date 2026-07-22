import { EventEmitter } from "node:events"
import { spawn } from "node:child_process"
import { describe, expect, it, vi } from "vitest"
import { buildFfmpegArgs, spawnFfmpeg } from "../ffmpeg"

vi.mock("node:child_process", () => ({ spawn: vi.fn() }))

describe("buildFfmpegArgs", () => {
  it("outputs to segmented path", () => {
    const args = buildFfmpegArgs("cam1", "/recordings/cam1")
    expect(args).toContain("rtsp://go2rtc:8554/cam1")
    expect(args).toContain("-c:v")
    expect(args).toContain("copy")
    expect(args).toContain("-an")
    expect(args).toContain("/recordings/cam1/%Y-%m-%d/%H-%M-%S.mp4")
  })
})

describe("spawnFfmpeg", () => {
  it("spawns ffmpeg with log redirection", () => {
    const proc = new EventEmitter() as unknown as import("node:child_process").ChildProcess
    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(proc)
    const result = spawnFfmpeg("cam1", "/recordings/cam1")
    expect(spawn).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining(["-i", "rtsp://go2rtc:8554/cam1"]), expect.any(Object))
    expect(result.process).toBe(proc)
  })
})
