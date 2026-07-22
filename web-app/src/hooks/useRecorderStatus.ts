import { useEffect, useState } from "react"

export interface RecorderStatus {
  state: "recording" | "retrying" | "stopped"
  restarts: number
}

export function useRecorderStatus(): Record<string, RecorderStatus> {
  const [status, setStatus] = useState<Record<string, RecorderStatus>>({})

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`)
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as { type: string; cameras?: Record<string, RecorderStatus> }
      if (msg.type === "status" && msg.cameras) setStatus(msg.cameras)
    }
    return () => ws.close()
  }, [])

  return status
}
