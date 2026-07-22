import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process"
import { createWriteStream, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

const GO2RTC_URL = process.env.GO2RTC_URL ?? "http://go2rtc:1984"

function getRtspUrl(cameraId: string): string {
  try {
    const url = new URL(GO2RTC_URL)
    const host = url.hostname
    const port = url.port || (url.protocol === "https:" ? "443" : "80")
    return `rtsp://${host}:8554/${cameraId}`
  } catch {
    return `rtsp://go2rtc:8554/${cameraId}`
  }
}

export function buildFfmpegArgs(cameraId: string, outputDir: string): string[] {
  return [
    "-rtsp_transport", "tcp",
    "-i", getRtspUrl(cameraId),
    "-c", "copy",
    "-f", "segment",
    "-segment_time", "60",
    "-segment_atclocktime", "1",
    "-reset_timestamps", "1",
    "-strftime", "1",
    join(outputDir, "%Y-%m-%d", "%H-%M-%S.mp4"),
  ]
}

export function spawnFfmpeg(cameraId: string, outputDir: string): { process: ChildProcess; logPath: string } {
  mkdirSync(outputDir, { recursive: true })
  const logDir = dirname(outputDir)
  mkdirSync(logDir, { recursive: true })
  const logPath = join(logDir, `${cameraId}.log`)
  const args = buildFfmpegArgs(cameraId, outputDir)
  const logStream = createWriteStream(logPath, { flags: "a" })
  const opts: SpawnOptions = {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  }
  const proc = spawn("ffmpeg", args, opts)
  proc.stdout?.pipe(logStream)
  proc.stderr?.pipe(logStream)
  proc.on("exit", () => logStream.end())
  return { process: proc, logPath }
}
