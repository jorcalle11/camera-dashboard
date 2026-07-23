import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  getStoredTheme,
  resolveTheme,
  setThemePreference,
  useTheme,
} from "../useTheme"

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.add(cb)
    },
    removeEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.delete(cb)
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
    emit(next: boolean) {
      mql.matches = next
      for (const cb of listeners) cb({ matches: next } as MediaQueryListEvent)
    },
  }
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql))
  return mql
}

describe("resolveTheme", () => {
  it("resolves system from OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark")
    expect(resolveTheme("system", false)).toBe("light")
    expect(resolveTheme("light", true)).toBe("light")
    expect(resolveTheme("dark", false)).toBe("dark")
  })
})

describe("theme persistence", () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove("dark")
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove("dark")
    vi.unstubAllGlobals()
  })

  it("defaults to system when unset", () => {
    expect(getStoredTheme()).toBe("system")
  })

  it("persists preference and applies dark class", () => {
    mockMatchMedia(false)
    setThemePreference("dark")
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)

    setThemePreference("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("applyResolvedTheme toggles html class", () => {
    applyResolvedTheme("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    applyResolvedTheme("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })
})

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove("dark")
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove("dark")
    vi.unstubAllGlobals()
  })

  it("follows system preference and updates on change", () => {
    const mql = mockMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe("system")
    expect(result.current.resolved).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)

    act(() => {
      mql.emit(false)
    })
    expect(result.current.resolved).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("setPreference forces light/dark and stores it", () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.setPreference("light")
    })
    expect(result.current.preference).toBe("light")
    expect(result.current.resolved).toBe("light")
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)

    act(() => {
      result.current.setPreference("dark")
    })
    expect(result.current.resolved).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })
})
