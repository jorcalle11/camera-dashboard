import { useEffect, useRef, useState } from "react"
import type { Camera } from "../types"
import VideoStream from "./VideoStream"

interface CameraTileProps {
  camera: Camera
}

export default function CameraTile({ camera }: CameraTileProps) {
  const tileRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  // Pause streams for tiles scrolled out of view (bandwidth/battery on phones).
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

  return (
    <div
      ref={tileRef}
      onClick={toggleFullscreen}
      className="relative aspect-video overflow-hidden rounded-lg bg-black"
    >
      <VideoStream cameraId={camera.id} paused={!visible} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-2">
        <span className="text-sm font-medium">{camera.name}</span>
      </div>
    </div>
  )
}
