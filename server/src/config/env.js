import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/model_product_studio",
  jwtSecret: process.env.JWT_SECRET ?? "change-me-in-local-dev",
  storageRoot: process.env.STORAGE_ROOT ?? "./storage",
  aiProvider: process.env.AI_PROVIDER ?? "mock",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image",
  geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? 180000),
  staleJobMinutes: Number(process.env.STALE_JOB_MINUTES ?? 5),
  jobConcurrency: Number(process.env.JOB_CONCURRENCY ?? 4)
};
