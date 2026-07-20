import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import LiveGrid from "../LiveGrid"

// VideoStream needs a live go2rtc; stub it out for component tests.
vi.mock("../VideoStream", () => ({
  default: ({ cameraId }: { cameraId: string }) => <div data-testid={`stream-${cameraId}`} />,
}))

// jsdom has no IntersectionObserver; stub one that reports "visible".
class FakeIntersectionObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.cb([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never)
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)

function mockCameras(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  )
}

describe("LiveGrid", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("renders one tile per camera with its name", async () => {
    mockCameras([
      { id: "cam1", name: "Front Door" },
      { id: "cam2", name: "Garage" },
    ])
    render(<LiveGrid />)
    await waitFor(() => expect(screen.getByText("Front Door")).toBeTruthy())
    expect(screen.getByText("Garage")).toBeTruthy()
    expect(screen.getByTestId("stream-cam1")).toBeTruthy()
    expect(screen.getByTestId("stream-cam2")).toBeTruthy()
  })

  it("shows an error state when cameras fail to load", async () => {
    mockCameras("boom", 500)
    render(<LiveGrid />)
    await waitFor(() => expect(screen.getByText(/HTTP 500/)).toBeTruthy())
  })
})
