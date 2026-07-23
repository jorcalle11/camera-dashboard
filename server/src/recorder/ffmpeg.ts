import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process"
import { createWriteStream, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { env, getRtspUrl } from "../env"

export function buildFfmpegArgs(cameraId: string, outputDir: string): string[] {
  return [
    "-rtsp_transport", "tcp",
    "-i", getRtspUrl(cameraId),
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "64k",
    "-ar", "16000",
    "-ac", "1",
    "-f", "segment",
    "-segment_time", "60",
    "-segment_atclocktime", "1",
    "-reset_timestamps", "1",
    "-strftime", "1",
    join(outputDir, "%Y-%m-%d", "%H-%M-%S.mp4"),
  ]
}

function preCreateSegmentDirs(outputDir: string): void {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  mkdirSync(join(outputDir, today), { recursive: true })
  mkdirSync(join(outputDir, tomorrow), { recursive: true })
}

export function spawnFfmpeg(cameraId: string, outputDir: string): { process: ChildProcess; logPath: string } {
  mkdirSync(outputDir, { recursive: true })
  preCreateSegmentDirs(outputDir)
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
