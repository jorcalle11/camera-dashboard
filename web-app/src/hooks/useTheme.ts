import { useCallback, useEffect, useState } from "react"

export type ThemePreference = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export const THEME_STORAGE_KEY = "theme"

const LISTENERS = new Set<() => void>()

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system"
}

export function getStoredTheme(): ThemePreference {
  if (typeof localStorage === "undefined") return "system"
  const raw = localStorage.getItem(THEME_STORAGE_KEY)
  return isThemePreference(raw) ? raw : "system"
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function resolveTheme(preference: ThemePreference, systemDark = getSystemPrefersDark()): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light"
  return preference
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", resolved === "dark")
}

export function setThemePreference(preference: ThemePreference): void {
  localStorage.setItem(THEME_STORAGE_KEY, preference)
  applyResolvedTheme(resolveTheme(preference))
  for (const listener of LISTENERS) listener()
}

export function useTheme(): {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getStoredTheme())
  const [systemDark, setSystemDark] = useState(() => getSystemPrefersDark())

  useEffect(() => {
    const sync = () => setPreferenceState(getStoredTheme())
    LISTENERS.add(sync)
    return () => {
      LISTENERS.delete(sync)
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystemDark(mq.matches)
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const resolved = resolveTheme(preference, systemDark)

  useEffect(() => {
    applyResolvedTheme(resolved)
  }, [resolved])

  const setPreference = useCallback((next: ThemePreference) => {
    setThemePreference(next)
    setPreferenceState(next)
  }, [])

  return { preference, resolved, setPreference }
}
