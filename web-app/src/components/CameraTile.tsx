import { useEffect, useRef, useState } from "react"
import type { Camera } from "../types"
import type { RecorderStatus } from "../hooks/useRecorderStatus"
import { useToast } from "../hooks/useToast.tsx"
import VideoStream from "./VideoStream"
import TileOverlay from "./TileOverlay"

interface CameraTileProps {
  camera: Camera
  status?: RecorderStatus
}

export default function CameraTile({ camera, status }: CameraTileProps) {
  const tileRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const { showToast } = useToast()
  const state = status?.state ?? "stopped"

  useEffect(() => {
    const tile = tileRef.current
    if (!tile) return
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { threshold: 0.1 },
    )
    observer.observe(tile)
    return () => observer.disconnect()
  }, [])

  const toggleFullscreen = () => {
    const tile = tileRef.current
    if (!tile) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void tile.requestFullscreen()
  }

  const takeSnapshot = async () => {
    try {
      const res = await fetch(`/api/cameras/${camera.id}/snapshots`, { method: "POST" })
      if (!res.ok) throw new Error(`Snapshot failed: ${res.status}`)
      const { path } = await res.json() as { path: string }
      const imgRes = await fetch(`/api/statics/recordings/${path}`)
      if (!imgRes.ok) throw new Error("Failed to download snapshot")
      const blob = await imgRes.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = path.split("/").pop()!
      a.click()
      URL.revokeObjectURL(url)
      showToast("Snapshot downloaded", "success")
    } catch (err) {
      showToast((err as Error).message, "error")
    }
  }

  return (
    <div
      ref={tileRef}
      onClick={toggleFullscreen}
      className="relative aspect-video overflow-hidden rounded-lg bg-black md:aspect-auto md:h-full"
    >
      <VideoStream cameraId={camera.id} paused={!visible} className="h-full w-full" />
      <TileOverlay camera={camera} state={state} onSnapshot={takeSnapshot} />
    </div>
  )
}
