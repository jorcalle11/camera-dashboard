import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ThemeSwitcher from "../ThemeSwitcher"
import { THEME_STORAGE_KEY } from "../../hooks/useTheme"

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  )
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.classList.remove("dark")
  vi.unstubAllGlobals()
})

describe("ThemeSwitcher", () => {
  it("opens menu and selects dark", () => {
    render(<ThemeSwitcher />)

    fireEvent.click(screen.getByRole("button", { name: /theme/i }))
    expect(screen.getByRole("menu", { name: "Theme" })).toBeTruthy()

    fireEvent.click(screen.getByRole("menuitemradio", { name: /dark/i }))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("selects system", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark")
    render(<ThemeSwitcher />)

    fireEvent.click(screen.getByRole("button", { name: /theme/i }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: /system/i }))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system")
  })
})
