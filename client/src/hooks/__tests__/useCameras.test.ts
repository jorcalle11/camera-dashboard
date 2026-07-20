import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useCameras } from "../useCameras"

describe("useCameras", () => {
  afterEach(() => vi.restoreAllMocks())

  it("loads cameras from /cameras.json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: "cam1", name: "Front Door" }]), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    const { result } = renderHook(() => useCameras())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cameras).toEqual([{ id: "cam1", name: "Front Door" }])
    expect(result.current.error).toBeNull()
    expect(fetch).toHaveBeenCalledWith("/cameras.json")
  })

  it("reports an error on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })))
    const { result } = renderHook(() => useCameras())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cameras).toEqual([])
    expect(result.current.error).toMatch(/500/)
  })
})
