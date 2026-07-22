import type { Camera } from "../types"

interface TileOverlayProps {
  camera: Camera
  state?: "recording" | "retrying" | "stopped"
  onSnapshot?: () => void
}

export default function TileOverlay({ camera, state = "stopped", onSnapshot }: TileOverlayProps) {
  return (
    <>
      <div className="pointer-events-none absolute left-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-2">
        {state === "recording" && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="recording" />}
        <span className="text-sm font-medium">{camera.name}</span>
        {state === "retrying" && <span className="text-xs text-yellow-400">retrying</span>}
      </div>
      {onSnapshot && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSnapshot()
          }}
          className="pointer-events-auto absolute bottom-2 right-2 rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
          aria-label="Take snapshot"
        >
          Snap
        </button>
      )}
    </>
  )
}
