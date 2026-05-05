import cors from "cors";
import express from "express";
import path from "node:path";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.js";
import generationRoutes from "./routes/generations.js";
import jobRoutes from "./routes/jobs.js";
import presetRoutes from "./routes/presets.js";
import projectRoutes from "./routes/projects.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { storageRoot } from "./storage/paths.js";

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use("/files", express.static(path.resolve(storageRoot)));

  app.get("/api/health", (req, res) =>
    res.json({
      ok: true,
      aiProvider: env.aiProvider,
      geminiConfigured: Boolean(env.geminiApiKey),
      geminiImageModel: env.geminiImageModel,
      geminiTransport: "rest"
    })
  );
  app.use("/api/auth", authRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/presets", presetRoutes);
  app.use("/api/generations", generationRoutes);
  app.use("/api/jobs", jobRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
