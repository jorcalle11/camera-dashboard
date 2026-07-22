import { useEffect, useRef, useState } from "react"
import type { Camera } from "../types"
import type { RecorderStatus } from "../hooks/useRecorderStatus"
import VideoStream from "./VideoStream"
import TileOverlay from "./TileOverlay"

interface CameraTileProps {
  camera: Camera
  status?: RecorderStatus
}

export default function CameraTile({ camera, status }: CameraTileProps) {
  const tileRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
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
    await fetch(`/api/cameras/${camera.id}/snapshots`, { method: "POST" })
  }

  return (
    <div
      ref={tileRef}
      onClick={toggleFullscreen}
      className="relative aspect-video overflow-hidden rounded-lg bg-black"
    >
      <VideoStream cameraId={camera.id} paused={!visible} className="h-full w-full" />
      <TileOverlay camera={camera} state={state} onSnapshot={takeSnapshot} />
    </div>
  )
}
