import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { v4 as uuid } from "uuid";
import { env } from "../config/env.js";
import { absoluteStoragePath, generatedDir } from "../storage/paths.js";
import { imageConfigForDimensions } from "./geminiImageConfig.js";

function assertGeminiConfigured() {
  if (!env.geminiApiKey) {
    const error = new Error("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
    error.statusCode = 500;
    throw error;
  }
}

async function filePart(asset) {
  const bytes = await fs.readFile(absoluteStoragePath(asset.storage_path));
  return {
    inlineData: {
      mimeType: asset.mime_type,
      data: bytes.toString("base64")
    }
  };
}

async function saveInlineImage(part, fallbackWidth, fallbackHeight) {
  const ext = part.inlineData.mimeType === "image/png" ? "png" : "jpg";
  const filename = `${uuid()}.${ext}`;
  const absolutePath = path.join(generatedDir, filename);
  const bytes = Buffer.from(part.inlineData.data, "base64");
  await fs.writeFile(absolutePath, bytes);
  return {
    storagePath: `generated/${filename}`,
    mimeType: part.inlineData.mimeType,
    sizeBytes: bytes.length,
    width: fallbackWidth,
    height: fallbackHeight
  };
}

async function callGemini({ prompt, assets, width, height, imageConfig }) {
  assertGeminiConfigured();
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  const contents = [{ text: prompt }];
  for (const asset of assets) contents.push(await filePart(asset));

  const request = {
    model: env.geminiImageModel,
    contents
  };
  if (imageConfig) {
    request.config = {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig
    };
  }

  const response = await withTimeout(
    ai.models.generateContent(request),
    env.geminiTimeoutMs,
    `Gemini image generation timed out after ${Math.round(env.geminiTimeoutMs / 1000)}s`
  );

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imageParts = parts.filter((part) => part.inlineData && !part.thought);
  const imagePart = imageParts.at(-1);
  if (!imagePart) throw new Error("Gemini did not return an image");
  return saveInlineImage(imagePart, width, height);
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const geminiProvider = {
  name: "gemini",
  generateBase({ prompt, modelAsset, productAssets }) {
    return callGemini({
      prompt,
      assets: [modelAsset, ...productAssets],
      width: 1400,
      height: 1800,
      imageConfig: imageConfigForDimensions(1400, 1800)
    });
  },
  generateUnfold({ prompt, baseAsset, preset }) {
    return callGemini({
      prompt,
      assets: [baseAsset],
      width: preset.width,
      height: preset.height,
      imageConfig: imageConfigForDimensions(preset.width, preset.height)
    });
  }
};
