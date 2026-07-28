import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import CameraSelect from "../CameraSelect"

describe("CameraSelect", () => {
  it("changes camera", () => {
    const onChange = vi.fn()
    render(
      <CameraSelect
        cameras={[
          { id: "cam1", name: "Front" },
          { id: "cam2", name: "Back" },
        ]}
        value="cam1"
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText("Camera"), { target: { value: "cam2" } })
    expect(onChange).toHaveBeenCalledWith("cam2")
  })
})
