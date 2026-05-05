import { describe, expect, it } from "vitest";

describe("Gemini provider response handling", () => {
  it("documents that final images should be non-thought image parts", () => {
    const parts = [
      { inlineData: { data: "thought", mimeType: "image/png" }, thought: true },
      { text: "Here is the final image" },
      { inlineData: { data: "final", mimeType: "image/png" } }
    ];
    const finalImage = parts.filter((part) => part.inlineData && !part.thought).at(-1);
    expect(finalImage.inlineData.data).toBe("final");
  });
});
