import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import { env } from "../config/env.js";
import { absoluteStoragePath, generatedDir } from "../storage/paths.js";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";

function assertGeminiConfigured() {
  if (!env.geminiApiKey) {
    const error = new Error("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
    error.statusCode = 500;
    throw error;
  }
}

function outputFormatForMimeType(mimeType) {
  if (mimeType === "image/png") return { ext: "png", mimeType: "image/png" };
  return { ext: "jpg", mimeType: "image/jpeg" };
}

export async function normalizeGeneratedImage(bytes, { mimeType, width, height }) {
  const format = outputFormatForMimeType(mimeType);
  const image = sharp(bytes, { failOn: "none" })
    .rotate()
    .resize(width, height, {
      fit: "cover",
      position: "center"
    });

  const normalizedBytes =
    format.ext === "png"
      ? await image.png({ compressionLevel: 9 }).toBuffer()
      : await image.jpeg({ quality: 95, mozjpeg: true }).toBuffer();

  return {
    bytes: normalizedBytes,
    ext: format.ext,
    mimeType: format.mimeType
  };
}

async function saveInlineImage(part, fallbackWidth, fallbackHeight) {
  const normalized = await normalizeGeneratedImage(Buffer.from(part.inlineData.data, "base64"), {
    mimeType: part.inlineData.mimeType,
    width: fallbackWidth,
    height: fallbackHeight
  });
  const ext = normalized.ext;
  const filename = `${uuid()}.${ext}`;
  const absolutePath = path.join(generatedDir, filename);
  await fs.writeFile(absolutePath, normalized.bytes);
  return {
    storagePath: `generated/${filename}`,
    mimeType: normalized.mimeType,
    sizeBytes: normalized.bytes.length,
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

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function errorMessageFromPayload(payload, fallback) {
  return payload.error?.message ?? payload.raw ?? fallback;
}

async function startGeminiUpload(asset, sizeBytes) {
  const response = await fetch(GEMINI_UPLOAD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.geminiApiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(sizeBytes),
      "X-Goog-Upload-Header-Content-Type": asset.mime_type
    },
    body: JSON.stringify({
      file: {
        display_name: path.basename(asset.storage_path)
      }
    })
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`Gemini file upload start failed: HTTP ${response.status}: ${errorMessageFromPayload(payload, response.statusText)}`);
  }

  const uploadUrl = response.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini file upload start did not return an upload URL");
  return uploadUrl;
}

async function uploadGeminiFile(asset) {
  const absolutePath = absoluteStoragePath(asset.storage_path);
  const stats = await fs.stat(absolutePath);
  const uploadUrl = await startGeminiUpload(asset, stats.size);
  const bytes = await fs.readFile(absolutePath);

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(stats.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: bytes
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`Gemini file upload failed: HTTP ${response.status}: ${errorMessageFromPayload(payload, response.statusText)}`);
  }
  if (!payload.file?.uri) throw new Error("Gemini file upload did not return a file URI");
  return payload.file;
}

async function deleteGeminiFiles(files) {
  await Promise.allSettled(
    files
      .filter((file) => file?.name)
      .map((file) =>
        fetch(`${GEMINI_API_BASE_URL}/${file.name}`, {
          method: "DELETE",
          headers: {
            "x-goog-api-key": env.geminiApiKey
          }
        })
      )
  );
}

export function buildGeminiImageRequest({ model, prompt, files }) {
  const parts = [
    { text: prompt },
    ...files.map((file) => ({
      file_data: {
        mime_type: file.mimeType,
        file_uri: file.uri
      }
    }))
  ];
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
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      const message = errorMessageFromPayload(payload, `HTTP ${response.status}`);
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
  const files = [];
  try {
    for (const asset of assets) {
      files.push(await uploadGeminiFile(asset));
    }

    const request = buildGeminiImageRequest({
      model: env.geminiImageModel,
      prompt,
      files
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
  } finally {
    await deleteGeminiFiles(files);
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
