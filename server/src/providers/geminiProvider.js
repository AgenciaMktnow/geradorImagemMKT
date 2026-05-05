import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { v4 as uuid } from "uuid";
import { env } from "../config/env.js";
import { absoluteStoragePath, generatedDir } from "../storage/paths.js";

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

function geminiErrorMessage(error) {
  if (!error?.message) return "Gemini request failed";
  try {
    const parsed = JSON.parse(error.message);
    return parsed.error?.message ?? error.message;
  } catch {
    return error.message;
  }
}

async function generateContent(ai, request) {
  return withTimeout(
    ai.models.generateContent(request),
    env.geminiTimeoutMs,
    `Gemini image generation timed out after ${Math.round(env.geminiTimeoutMs / 1000)}s`
  );
}

function summarizeNoImageResponse(response) {
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .filter((part) => part.text)
    .map((part) => part.text.trim())
    .join(" ")
    .slice(0, 500);
  const finishReason = candidate?.finishReason ? `finishReason=${candidate.finishReason}` : null;
  const safety = candidate?.safetyRatings?.length ? `safety=${JSON.stringify(candidate.safetyRatings).slice(0, 500)}` : null;
  return [finishReason, safety, text ? `text=${text}` : null].filter(Boolean).join("; ");
}

export async function buildGeminiImageRequest({ model, prompt, assets }) {
  const contents = [{ text: prompt }];
  for (const asset of assets) contents.push(await filePart(asset));
  return {
    model,
    contents
  };
}

async function callGemini({ prompt, assets, width, height }) {
  assertGeminiConfigured();
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  try {
    const request = await buildGeminiImageRequest({
      model: env.geminiImageModel,
      prompt,
      assets
    });

    const response = await generateContent(ai, request);
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imageParts = parts.filter((part) => part.inlineData && !part.thought);
    const imagePart = imageParts.at(-1);
    if (!imagePart) {
      const details = summarizeNoImageResponse(response);
      throw new Error(`Gemini model ${env.geminiImageModel} did not return an image${details ? ` (${details})` : ""}`);
    }
    return saveInlineImage(imagePart, width, height);
  } catch (error) {
    const message = geminiErrorMessage(error);
    throw new Error(`Gemini ${env.geminiImageModel} failed: ${message}`);
  }
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
      height: 1800
    });
  },
  generateUnfold({ prompt, baseAsset, preset }) {
    return callGemini({
      prompt,
      assets: [baseAsset],
      width: preset.width,
      height: preset.height
    });
  }
};
