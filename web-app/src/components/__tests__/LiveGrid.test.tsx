import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ToastProvider } from "../../hooks/useToast.tsx"
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
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renders one tile per camera with its name", async () => {
    mockCameras([
      { id: "cam1", name: "Front Door" },
      { id: "cam2", name: "Garage" },
    ])
    render(
      <ToastProvider>
        <LiveGrid />
      </ToastProvider>,
    )
    await waitFor(() => expect(screen.getByText("Front Door")).toBeTruthy())
    expect(screen.getByText("Garage")).toBeTruthy()
    expect(screen.getByTestId("stream-cam1")).toBeTruthy()
    expect(screen.getByTestId("stream-cam2")).toBeTruthy()
    const layout = screen.getByTestId("camera-layout")
    expect(layout.className).toBe("camera-wall")
    expect(screen.getByTestId("stream-cam1").parentElement?.className).toContain("aspect-video")
    expect(screen.getByTestId("stream-cam1").parentElement?.className).not.toContain("md:h-full")
  })

  it("keeps a 16:9 tile for every camera when there are more than four", async () => {
    mockCameras(
      Array.from({ length: 6 }, (_, i) => ({ id: `cam${i + 1}`, name: `Camera ${i + 1}` })),
    )
    render(
      <ToastProvider>
        <LiveGrid />
      </ToastProvider>,
    )
    await waitFor(() => expect(screen.getByText("Camera 6")).toBeTruthy())
    const layout = screen.getByTestId("camera-layout")
    expect(layout.className).toBe("camera-wall")
    expect(layout.children).toHaveLength(6)
    expect(screen.getByTestId("stream-cam6").parentElement?.className).toContain("aspect-video")
  })

  it("shows an error state when cameras fail to load", async () => {
    mockCameras("boom", 500)
    render(
      <ToastProvider>
        <LiveGrid />
      </ToastProvider>,
    )
    await waitFor(() => expect(screen.getByText(/HTTP 500/)).toBeTruthy())
  })
})
