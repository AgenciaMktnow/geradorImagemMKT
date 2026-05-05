import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

export const storageRoot = path.isAbsolute(env.storageRoot)
  ? env.storageRoot
  : path.resolve(repoRoot, env.storageRoot);
export const uploadsDir = path.join(storageRoot, "uploads");
export const generatedDir = path.join(storageRoot, "generated");

export async function ensureStorage() {
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(generatedDir, { recursive: true });
}

export function publicPathForStoragePath(storagePath) {
  return `/files/${storagePath}`;
}

export function absoluteStoragePath(storagePath) {
  return path.join(storageRoot, storagePath);
}
