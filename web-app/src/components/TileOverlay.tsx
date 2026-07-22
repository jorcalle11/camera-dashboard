import type { Camera } from "../types"

interface TileOverlayProps {
  camera: Camera
  state?: "recording" | "retrying" | "stopped"
  onSnapshot?: () => void
}

export default function TileOverlay({ camera, state = "stopped", onSnapshot }: TileOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-2">
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
          className="pointer-events-auto rounded bg-white/10 p-1.5 hover:bg-white/20"
          aria-label="Take snapshot"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        </button>
      )}
    </div>
  )
}
