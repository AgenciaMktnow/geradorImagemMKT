import fs from "node:fs/promises";
import path from "node:path";
import { createPartFromUri, createUserContent, GoogleGenAI } from "@google/genai";
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

async function uploadFilePart(ai, asset) {
  const file = await ai.files.upload({
    file: absoluteStoragePath(asset.storage_path),
    config: { mimeType: asset.mime_type }
  });
  return {
    file,
    part: createPartFromUri(file.uri, file.mimeType)
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

export function buildGeminiImageRequest({ model, prompt, fileParts, width, height }) {
  const contents = createUserContent([{ text: prompt }, ...fileParts]);
  return {
    model,
    contents,
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: imageConfigForDimensions(width, height)
    }
  };
}

async function deleteUploadedFiles(ai, files) {
  await Promise.allSettled(
    files
      .filter((file) => file?.name)
      .map((file) => ai.files.delete({ name: file.name }))
  );
}

async function callGemini({ prompt, assets, width, height }) {
  assertGeminiConfigured();
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  const uploaded = [];
  try {
    const uploads = [];
    for (const asset of assets) uploads.push(await uploadFilePart(ai, asset));
    uploaded.push(...uploads.map((upload) => upload.file));

    const request = buildGeminiImageRequest({
      model: env.geminiImageModel,
      prompt,
      fileParts: uploads.map((upload) => upload.part),
      width,
      height
    });

    const response = await generateContent(ai, request);
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imageParts = parts.filter((part) => part.inlineData && !part.thought);
    const imagePart = imageParts.at(-1);
    if (!imagePart) throw new Error(`Gemini model ${env.geminiImageModel} did not return an image`);
    return saveInlineImage(imagePart, width, height);
  } catch (error) {
    const message = geminiErrorMessage(error);
    throw new Error(`Gemini ${env.geminiImageModel} failed: ${message}`);
  } finally {
    await deleteUploadedFiles(ai, uploaded);
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
