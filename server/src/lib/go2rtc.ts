const GO2RTC_URL = process.env.GO2RTC_URL ?? "http://go2rtc:1984"

export function getRtspUrl(cameraId: string): string {
  try {
    const url = new URL(GO2RTC_URL)
    const host = url.hostname
    return `rtsp://${host}:8554/${cameraId}`
  } catch {
    return `rtsp://go2rtc:8554/${cameraId}`
  }
}
