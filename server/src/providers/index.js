import { env } from "../config/env.js";
import { geminiProvider } from "./geminiProvider.js";
import { mockProvider } from "./mockProvider.js";

export function getAiProvider() {
  if (env.aiProvider === "gemini") return geminiProvider;
  return mockProvider;
}
