import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildGeminiImageRequest, normalizeGeneratedImage } from "../src/providers/geminiProvider.js";

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

  it("builds a Gemini 3.1 image request with uploaded file references", () => {
    const request = buildGeminiImageRequest({
      model: "gemini-3.1-flash-image-preview",
      prompt: "Create the campaign image",
      files: [
        {
          mimeType: "image/png",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/example"
        }
      ]
    });

    expect(request.model).toBe("gemini-3.1-flash-image-preview");
    expect(request.body).toEqual({
      contents: [
        {
          parts: [
            { text: "Create the campaign image" },
            {
              file_data: {
                mime_type: "image/png",
                file_uri: "https://generativelanguage.googleapis.com/v1beta/files/example"
              }
            }
          ]
        }
      ]
    });
  });

  it("normalizes generated images to the requested output dimensions", async () => {
    const geminiSizedBytes = await sharp({
      create: {
        width: 768,
        height: 1376,
        channels: 3,
        background: "#ef9a9a"
      }
    })
      .jpeg()
      .toBuffer();

    const output = await normalizeGeneratedImage(geminiSizedBytes, {
      mimeType: "image/jpeg",
      width: 1080,
      height: 1920
    });

    const metadata = await sharp(output.bytes).metadata();
    expect(output.mimeType).toBe("image/jpeg");
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1920);
  });
});
