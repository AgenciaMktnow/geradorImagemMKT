import { describe, expect, it } from "vitest";
import { buildGeminiImageRequest } from "../src/providers/geminiProvider.js";

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

  it("builds a minimal Gemini 3.1 image request with inline images", async () => {
    const request = await buildGeminiImageRequest({
      model: "gemini-3.1-flash-image-preview",
      prompt: "Create the campaign image",
      assets: [
        {
          mime_type: "image/png",
          storage_path: "uploads/.gitkeep"
        }
      ]
    });

    expect(request.model).toBe("gemini-3.1-flash-image-preview");
    expect(request.config).toBeUndefined();
    expect(request.contents).toHaveLength(2);
    expect(request.contents[0]).toEqual({ text: "Create the campaign image" });
    expect(request.contents[1]).toEqual({
      inlineData: {
        mimeType: "image/png",
        data: "Cg=="
      }
    });
  });
});
