import { describe, expect, it } from "vitest";
import { imageConfigForDimensions } from "../src/providers/geminiImageConfig.js";

describe("Gemini image config", () => {
  it("maps common social formats to supported Nano Banana 2 ratios", () => {
    expect(imageConfigForDimensions(1080, 1920)).toEqual({ aspectRatio: "9:16", imageSize: "2K" });
    expect(imageConfigForDimensions(1080, 1080)).toEqual({ aspectRatio: "1:1", imageSize: "2K" });
    expect(imageConfigForDimensions(1080, 1350)).toEqual({ aspectRatio: "4:5", imageSize: "2K" });
  });

  it("chooses the nearest supported ratio for non-native banner sizes", () => {
    expect(imageConfigForDimensions(1920, 640)).toEqual({ aspectRatio: "21:9", imageSize: "2K" });
    expect(imageConfigForDimensions(1600, 500)).toEqual({ aspectRatio: "4:1", imageSize: "2K" });
  });
});
