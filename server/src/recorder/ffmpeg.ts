import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process"
import { createWriteStream, mkdirSync, statSync, truncateSync } from "node:fs"
import { join } from "node:path"
import { env, getRtspUrl } from "../env.js"

export function buildFfmpegArgs(cameraId: string, outputDir: string): string[] {
  return [
    "-nostats",
    "-loglevel", "warning",
    "-fflags", "+genpts+discardcorrupt",
    "-use_wallclock_as_timestamps", "1",
    "-rtsp_transport", "tcp",
    "-i", getRtspUrl(cameraId),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "64k",
    "-ar", "16000",
    "-ac", "1",
    "-f", "segment",
    "-segment_time", "60",
    "-segment_atclocktime", "1",
    "-reset_timestamps", "1",
    "-avoid_negative_ts", "make_zero",
    "-strftime", "1",
    "-segment_format_options", "movflags=frag_keyframe+empty_moov+default_base_moof",
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

const LOG_ROTATE_BYTES = 10 * 1024 * 1024 // 10MB

export function spawnFfmpeg(cameraId: string, outputDir: string): { process: ChildProcess; logPath: string } {
  mkdirSync(outputDir, { recursive: true })
  preCreateSegmentDirs(outputDir)
  const logDir = join(env.DATA_PATH, "logs")
  mkdirSync(logDir, { recursive: true })
  const logPath = join(logDir, `${cameraId}.log`)
  try {
    const st = statSync(logPath)
    if (st.size > LOG_ROTATE_BYTES) {
      truncateSync(logPath, 0)
    }
  } catch {
    // ignore if file doesn't exist
  }
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
