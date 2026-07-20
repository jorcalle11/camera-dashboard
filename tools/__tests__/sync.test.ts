import { describe, expect, it } from "vitest"
import { cameraEnvKeys, syncCameras, type RawCameraEntry } from "../sync"

const front: RawCameraEntry = {
  id: "cam1",
  name: "Front Door",
  url: "${CAM1_RTSP_URL}",
  enabled: true,
  retention_days: 7,
}

describe("cameraEnvKeys", () => {
  it("extracts CAMn_RTSP_URL keys in numeric order", () => {
    const env = ["CAM10_RTSP_URL", "HOST_IP", "CAM2_RTSP_URL", "CAM1_RTSP_URL", "OTHER"]
    expect(cameraEnvKeys(env)).toEqual(["CAM1_RTSP_URL", "CAM2_RTSP_URL", "CAM10_RTSP_URL"])
  })
})

describe("syncCameras", () => {
  it("adds new cameras with default name and settings", () => {
    const result = syncCameras(["CAM1_RTSP_URL", "CAM2_RTSP_URL"], [front])
    expect(result.added).toEqual(["cam2"])
    expect(result.removed).toEqual([])
    expect(result.cameras).toEqual([
      front,
      {
        id: "cam2",
        name: "Camera 2",
        url: "${CAM2_RTSP_URL}",
        enabled: true,
        retention_days: 7,
      },
    ])
  })

  it("preserves manual renames and settings for existing cameras", () => {
    const custom: RawCameraEntry = { ...front, name: "Porch", enabled: false, retention_days: 30 }
    const result = syncCameras(["CAM1_RTSP_URL"], [custom])
    expect(result.cameras).toEqual([custom])
    expect(result.added).toEqual([])
  })

  it("removes cameras whose env var disappeared", () => {
    const gone: RawCameraEntry = {
      id: "cam2",
      name: "Garage",
      url: "${CAM2_RTSP_URL}",
      enabled: true,
      retention_days: 7,
    }
    const result = syncCameras(["CAM1_RTSP_URL"], [front, gone])
    expect(result.removed).toEqual(["cam2"])
    expect(result.cameras).toEqual([front])
  })

  it("keeps entries with custom urls that do not reference CAMn env vars", () => {
    const manual: RawCameraEntry = {
      id: "doorbell",
      name: "Doorbell",
      url: "rtsp://example.local/stream",
      enabled: true,
      retention_days: 7,
    }
    const result = syncCameras(["CAM1_RTSP_URL"], [front, manual])
    expect(result.cameras).toEqual([front, manual])
    expect(result.removed).toEqual([])
  })

  it("builds a full list from scratch", () => {
    const result = syncCameras(["CAM1_RTSP_URL"], [])
    expect(result.cameras).toEqual([
      { id: "cam1", name: "Camera 1", url: "${CAM1_RTSP_URL}", enabled: true, retention_days: 7 },
    ])
    expect(result.added).toEqual(["cam1"])
  })
})
