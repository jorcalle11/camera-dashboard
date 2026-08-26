import { useEffect, useState, type MouseEvent } from "react"

const TIMELINE_PATH = /^\/([^/]+)\/timeline\/?$/

export function timelinePath(cameraId: string): string {
  return `/${encodeURIComponent(cameraId)}/timeline`
}

export function cameraIdFromPath(pathname: string): string | null {
  const match = pathname.match(TIMELINE_PATH)
  return match ? decodeURIComponent(match[1]!) : null
}

const listeners = new Set<() => void>()

export function navigate(path: string): void {
  if (window.location.pathname === path) return
  window.history.pushState(null, "", path)
  for (const listener of listeners) listener()
}

export function usePathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname)
    listeners.add(sync)
    window.addEventListener("popstate", sync)
    return () => {
      listeners.delete(sync)
      window.removeEventListener("popstate", sync)
    }
  }, [])

  return pathname
}

/** Client-side navigate on plain left-click; keep default for new-tab / modified clicks. */
export function handleSpaLinkClick(event: MouseEvent<HTMLAnchorElement>, path: string): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  navigate(path)
}
