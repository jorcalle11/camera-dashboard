import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import TileOverlay from "../TileOverlay"

const CAMERA = { id: "cam1", name: "Front Door" }

describe("TileOverlay", () => {
  afterEach(cleanup)

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
    expect(screen.getByLabelText("Take snapshot").getAttribute("title")).toBe("Take snapshot")
  })

  it("links the clock button to the camera timeline page", () => {
    render(<TileOverlay camera={CAMERA} state="recording" onSnapshot={vi.fn()} />)
    const link = screen.getByLabelText("Open Front Door timeline")
    expect(link.tagName).toBe("A")
    expect(link.getAttribute("href")).toBe("/cam1/timeline")
    expect(link.getAttribute("title")).toBe("Open timeline")
  })
})
