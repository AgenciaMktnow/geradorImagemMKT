import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";

describe("health endpoint", () => {
  it("exposes non-sensitive AI provider diagnostics", async () => {
    const response = await request(createApp()).get("/api/health").expect(200);

    expect(response.body).toEqual({
      ok: true,
      aiProvider: env.aiProvider,
      geminiConfigured: Boolean(env.geminiApiKey),
      geminiImageModel: env.geminiImageModel
    });
    if (env.geminiApiKey) expect(response.text).not.toContain(env.geminiApiKey);
  });
});
