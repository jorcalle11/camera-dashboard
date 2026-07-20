export const GO2RTC_BASE = "/go2rtc"

export function posterUrl(cameraId: string): string {
  return `${GO2RTC_BASE}/api/frame.jpeg?src=${encodeURIComponent(cameraId)}`
}

export function streamWsUrl(cameraId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}${GO2RTC_BASE}/api/ws?src=${encodeURIComponent(cameraId)}`
}

let scriptPromise: Promise<void> | null = null

/** Load go2rtc's video-stream.js custom element exactly once. */
export function loadVideoStreamElement(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.type = "module"
      script.src = `${GO2RTC_BASE}/video-stream.js`
      script.onload = () => resolve()
      script.onerror = () => {
        scriptPromise = null
        reject(new Error("failed to load video-stream.js from go2rtc"))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}
