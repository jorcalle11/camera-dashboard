import type { Camera } from "../types"

interface TileOverlayProps {
  camera: Camera
  state?: "recording" | "retrying" | "stopped"
  onSnapshot?: () => void
}

export default function TileOverlay({ camera, state = "stopped", onSnapshot }: TileOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-2">
      <div className="flex items-center gap-2">
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
          className="pointer-events-auto rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
          aria-label="Take snapshot"
        >
          Snap
        </button>
      )}
    </div>
  )
}
