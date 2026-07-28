import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import TransportBar from "../TransportBar"

describe("TransportBar", () => {
  it("fires transport callbacks", () => {
    const onTogglePlay = vi.fn()
    const onSkip = vi.fn()
    const onCycleSpeed = vi.fn()
    const onFullscreen = vi.fn()
    render(
      <TransportBar
        playing={false}
        speed={1}
        onTogglePlay={onTogglePlay}
        onSkip={onSkip}
        onCycleSpeed={onCycleSpeed}
        onFullscreen={onFullscreen}
      />,
    )

    fireEvent.click(screen.getByLabelText("Play"))
    fireEvent.click(screen.getByLabelText("Back 10 seconds"))
    fireEvent.click(screen.getByLabelText("Forward 10 seconds"))
    fireEvent.click(screen.getByLabelText("Playback speed 1x"))
    fireEvent.click(screen.getByLabelText("Fullscreen"))

    expect(onTogglePlay).toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalledWith(-10)
    expect(onSkip).toHaveBeenCalledWith(10)
    expect(onCycleSpeed).toHaveBeenCalled()
    expect(onFullscreen).toHaveBeenCalled()
  })
})
