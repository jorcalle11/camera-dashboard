import { describe, expect, it } from "vitest"
import { cameraIdFromPath, timelinePath } from "../routes"

describe("timelinePath", () => {
  it("builds /camId/timeline", () => {
    expect(timelinePath("cam1")).toBe("/cam1/timeline")
  })
})

describe("cameraIdFromPath", () => {
  it("reads the camera id from the timeline URL", () => {
    expect(cameraIdFromPath("/cam1/timeline")).toBe("cam1")
    expect(cameraIdFromPath("/cam1/timeline/")).toBe("cam1")
  })

  it("returns null for the live page", () => {
    expect(cameraIdFromPath("/")).toBeNull()
    expect(cameraIdFromPath("/live")).toBeNull()
  })
})
