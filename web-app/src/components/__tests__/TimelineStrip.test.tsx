import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import TimelineStrip from "../TimelineStrip"
import { MS_PER_DAY } from "../../lib/timeline"

describe("TimelineStrip", () => {
  it("jumps playhead on click", () => {
    const onPlayheadChange = vi.fn()
    const onZoomChange = vi.fn()
    const { container } = render(
      <TimelineStrip
        ranges={[{ startMsOfDay: 0, endMsOfDay: 3600000 }]}
        playheadMsOfDay={0}
        zoom={{ startMs: 0, endMs: MS_PER_DAY }}
        onPlayheadChange={onPlayheadChange}
        onZoomChange={onZoomChange}
      />,
    )

    const slider = container.querySelector('[role="slider"]')!
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      height: 40,
      right: 100,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(slider, { clientX: 50 })
    expect(onPlayheadChange).toHaveBeenCalled()
    const ms = onPlayheadChange.mock.calls[0]![0] as number
    expect(Number.isFinite(ms)).toBe(true)
    expect(ms).toBeGreaterThan(0)
  })

  it("moves playhead with keyboard", () => {
    const onPlayheadChange = vi.fn()
    const { container } = render(
      <TimelineStrip
        ranges={[]}
        playheadMsOfDay={10_000}
        zoom={{ startMs: 0, endMs: MS_PER_DAY }}
        onPlayheadChange={onPlayheadChange}
        onZoomChange={vi.fn()}
      />,
    )
    const slider = container.querySelector('[role="slider"]')!
    fireEvent.keyDown(slider, { key: "ArrowRight" })
    expect(onPlayheadChange).toHaveBeenCalledWith(15_000)
  })
})
