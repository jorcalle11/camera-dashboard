import { join } from "node:path"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  GO2RTC_URL: process.env.GO2RTC_URL ?? "http://go2rtc:1984",
  RECORDINGS_PATH: process.env.RECORDINGS_PATH ?? "/recordings",
  DATA_PATH: process.env.DATA_PATH ?? "/data",
  CAMERAS_YML_PATH: process.env.CAMERAS_YML_PATH ?? "/workspace/cameras.yml",
  DISK_FREE_THRESHOLD_GB: Number(process.env.DISK_FREE_THRESHOLD_GB ?? "10"),
  PORT: Number(process.env.PORT ?? "3000"),
  GO2RTC_RTSP_PORT: Number(process.env.GO2RTC_RTSP_PORT ?? "8554"),
  DB_PATH: join(process.env.DATA_PATH ?? "/data", "nvr.db"),
}

export function getRtspUrl(cameraId: string): string {
  try {
    const url = new URL(env.GO2RTC_URL)
    return `rtsp://${url.hostname}:${env.GO2RTC_RTSP_PORT}/${cameraId}`
  } catch {
    return `rtsp://go2rtc:${env.GO2RTC_RTSP_PORT}/${cameraId}`
  }
}
