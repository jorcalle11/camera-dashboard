import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import TileOverlay from "../TileOverlay"

const CAMERA = { id: "cam1", name: "Front Door" }

describe("TileOverlay", () => {
  it("shows camera name", () => {
    render(<TileOverlay camera={CAMERA} state="recording" />)
    expect(screen.getByText("Front Door")).toBeTruthy()
  })

  it("shows retrying badge", () => {
    render(<TileOverlay camera={CAMERA} state="retrying" />)
    expect(screen.getByText("retrying")).toBeTruthy()
  })

  it("calls onSnapshot when snap button clicked", () => {
    const onSnapshot = vi.fn()
    render(<TileOverlay camera={CAMERA} state="recording" onSnapshot={onSnapshot} />)
    screen.getByLabelText("Take snapshot").click()
    expect(onSnapshot).toHaveBeenCalled()
  })

  it("calls onHistory when History clicked", () => {
    const onHistory = vi.fn()
    render(<TileOverlay camera={CAMERA} state="recording" onHistory={onHistory} />)
    screen.getByLabelText("Open history").click()
    expect(onHistory).toHaveBeenCalled()
  })
})
