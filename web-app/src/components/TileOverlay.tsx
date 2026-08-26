import type { Camera } from "../types"
import { handleSpaLinkClick, timelinePath } from "../lib/routes"

interface TileOverlayProps {
  camera: Camera
  state?: "recording" | "retrying" | "stopped"
  onSnapshot?: () => void
}

const iconBtnClass =
  "pointer-events-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-white/10 hover:bg-white/20"

export default function TileOverlay({ camera, state = "stopped", onSnapshot }: TileOverlayProps) {
  const timelineHref = timelinePath(camera.id)

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-2 text-white">
      <div className="flex items-center gap-2">
        {state === "recording" && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="recording" />}
        <span className="text-sm font-medium">{camera.name}</span>
        {state === "retrying" && <span className="text-xs text-yellow-400">retrying</span>}
        <div className="flex items-center gap-1">
          {onSnapshot && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSnapshot()
              }}
              className={iconBtnClass}
              aria-label="Take snapshot"
              title="Take snapshot"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </button>
          )}
          <a
            href={timelineHref}
            onClick={(e) => {
              e.stopPropagation()
              handleSpaLinkClick(e, timelineHref)
            }}
            className={iconBtnClass}
            aria-label={`Open ${camera.name} timeline`}
            title="Open timeline"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  )
}
