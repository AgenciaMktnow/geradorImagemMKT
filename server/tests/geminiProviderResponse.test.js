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

  it("builds a Gemini 3.1 image request with file references", () => {
    const request = buildGeminiImageRequest({
      model: "gemini-3.1-flash-image-preview",
      prompt: "Create the campaign image",
      fileParts: [{ fileData: { fileUri: "https://generativelanguage.googleapis.com/v1beta/files/test", mimeType: "image/png" } }],
      width: 1400,
      height: 1800
    });

    expect(request.model).toBe("gemini-3.1-flash-image-preview");
    expect(request.config).toEqual({
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: "4:5",
        imageSize: "2K"
      }
    });
    expect(request.contents.parts).toHaveLength(2);
  });
});
