import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { env } from "../config/env.js";
import { absoluteStoragePath, generatedDir } from "../storage/paths.js";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

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
    inline_data: {
      mime_type: asset.mime_type,
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

function summarizeNoImageResponse(response) {
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const partKeys = parts.map((part) => Object.keys(part).join("+")).join(",");
  const text = parts
    .filter((part) => part.text)
    .map((part) => part.text.trim())
    .join(" ")
    .slice(0, 500);
  const promptFeedback = response.promptFeedback ? `promptFeedback=${JSON.stringify(response.promptFeedback).slice(0, 500)}` : null;
  const candidateKeys = candidate ? `candidateKeys=${Object.keys(candidate).join(",")}` : "candidateKeys=none";
  const partSummary = `parts=${parts.length}${partKeys ? `:${partKeys}` : ""}`;
  const finishReason = candidate?.finishReason ? `finishReason=${candidate.finishReason}` : null;
  const safety = candidate?.safetyRatings?.length ? `safety=${JSON.stringify(candidate.safetyRatings).slice(0, 500)}` : null;
  return [candidateKeys, partSummary, finishReason, safety, promptFeedback, text ? `text=${text}` : null].filter(Boolean).join("; ");
}

export async function buildGeminiImageRequest({ model, prompt, assets }) {
  const parts = [{ text: prompt }];
  for (const asset of assets) parts.push(await filePart(asset));
  return {
    model,
    body: {
      contents: [{ parts }]
    }
  };
}

async function callGeminiApi({ model, body }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.geminiTimeoutMs);
  const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.geminiApiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (!response.ok) {
      const message = payload.error?.message ?? text ?? `HTTP ${response.status}`;
      throw new Error(`HTTP ${response.status}: ${message}`);
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Gemini image generation timed out after ${Math.round(env.geminiTimeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini({ prompt, assets, width, height }) {
  assertGeminiConfigured();
  try {
    const request = await buildGeminiImageRequest({
      model: env.geminiImageModel,
      prompt,
      assets
    });

    const response = await callGeminiApi(request);
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imageParts = parts.filter((part) => (part.inlineData || part.inline_data) && !part.thought);
    const imagePart = imageParts.at(-1);
    if (!imagePart) {
      const details = summarizeNoImageResponse(response);
      throw new Error(`Gemini model ${env.geminiImageModel} did not return an image${details ? ` (${details})` : ""}`);
    }
    if (imagePart.inline_data && !imagePart.inlineData) {
      imagePart.inlineData = {
        mimeType: imagePart.inline_data.mime_type,
        data: imagePart.inline_data.data
      };
    }
    return saveInlineImage(imagePart, width, height);
  } catch (error) {
    const message = geminiErrorMessage(error);
    throw new Error(`Gemini ${env.geminiImageModel} failed: ${message}`);
  }
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
