import fs from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { query } from "../db/pool.js";
import { enqueueBaseGeneration, enqueueUnfoldGeneration } from "../jobs/processor.js";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../storage/upload.js";
import { absoluteStoragePath, publicPathForStoragePath } from "../storage/paths.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();
router.use(requireAuth);

const promptSchema = z.object({
  scenario: z.string().trim().max(1000).optional().default(""),
  style: z.string().trim().max(1000).optional().default(""),
  pose: z.string().trim().max(1000).optional().default(""),
  extraInstructions: z.string().trim().max(1500).optional().default(""),
  negativePrompt: z.string().trim().max(1000).optional().default("")
});

const unfoldSchema = z.object({
  presetIds: z.array(z.string().uuid()).min(1)
});
const regenerateUnfoldSchema = z.object({
  extraInstructions: z.string().trim().max(1500).optional().default("")
});

function assetUrl(row) {
  if (!row?.asset_id) return null;
  return {
    id: row.asset_id,
    kind: row.asset_kind,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    url: publicPathForStoragePath(row.storage_path)
  };
}

async function assertProject(userId, projectId) {
  const result = await query("SELECT * FROM projects WHERE id = $1 AND user_id = $2", [projectId, userId]);
  if (!result.rowCount) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }
  return result.rows[0];
}

async function insertUploadAsset({ userId, projectId, kind, file }) {
  const storagePath = `uploads/${file.filename}`;
  const result = await query(
    `INSERT INTO assets (user_id, project_id, kind, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, projectId, kind, file.originalname, file.mimetype, file.size, storagePath]
  );
  return result.rows[0];
}

async function generationPayload(generationId, userId) {
  const generationResult = await query(
    `SELECT g.*, p.name AS project_name
     FROM generations g
     JOIN projects p ON p.id = g.project_id
     WHERE g.id = $1 AND g.user_id = $2`,
    [generationId, userId]
  );
  if (!generationResult.rowCount) return null;

  const products = await query(
    `SELECT a.id, a.kind, a.original_name, a.mime_type, a.storage_path
     FROM assets a
     JOIN generation_products gp ON gp.asset_id = a.id
     WHERE gp.generation_id = $1`,
    [generationId]
  );

  const results = await query(
    `SELECT gr.id, gr.kind, gr.created_at, dp.name AS preset_name, dp.width AS preset_width, dp.height AS preset_height,
       a.id AS asset_id, a.kind AS asset_kind, a.mime_type, a.storage_path, a.width, a.height
     FROM generation_results gr
     JOIN assets a ON a.id = gr.asset_id
     LEFT JOIN dimension_presets dp ON dp.id = gr.preset_id
     WHERE gr.generation_id = $1
     ORDER BY gr.created_at`,
    [generationId]
  );

  const jobs = await query(
    `SELECT j.*, dp.name AS preset_name, dp.width, dp.height
     FROM jobs j
     LEFT JOIN dimension_presets dp ON dp.id = j.preset_id
     WHERE j.generation_id = $1
     ORDER BY j.created_at DESC`,
    [generationId]
  );

  return {
    generation: generationResult.rows[0],
    products: products.rows.map((asset) => ({ ...asset, url: publicPathForStoragePath(asset.storage_path) })),
    results: results.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      presetName: row.preset_name,
      presetWidth: row.preset_width,
      presetHeight: row.preset_height,
      createdAt: row.created_at,
      asset: assetUrl(row)
    })),
    jobs: jobs.rows
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const projectId = req.query.projectId;
  const params = [req.user.id];
  let where = "WHERE g.user_id = $1";
  if (projectId) {
    params.push(projectId);
    where += " AND g.project_id = $2";
  }

  const result = await query(
    `SELECT g.*, p.name AS project_name,
      base_asset.storage_path AS base_storage_path,
      base_asset.mime_type AS base_mime_type
     FROM generations g
     JOIN projects p ON p.id = g.project_id
     LEFT JOIN LATERAL (
       SELECT a.storage_path, a.mime_type
       FROM generation_results gr
       JOIN assets a ON a.id = gr.asset_id
       WHERE gr.generation_id = g.id AND gr.kind = 'base'
       ORDER BY gr.created_at DESC
       LIMIT 1
     ) base_asset ON true
     ${where}
     ORDER BY g.created_at DESC
     LIMIT 100`,
    params
  );
  res.json({
    generations: result.rows.map((row) => ({
      ...row,
      baseUrl: row.base_storage_path ? publicPathForStoragePath(row.base_storage_path) : null
    }))
  });
}));

router.post("/", upload.fields([
  { name: "model", maxCount: 1 },
  { name: "products", maxCount: 5 }
]), asyncHandler(async (req, res) => {
  const projectId = req.body.projectId;
  const prompt = promptSchema.parse(JSON.parse(req.body.prompt ?? "{}"));
  const modelFile = req.files?.model?.[0];
  const productFiles = req.files?.products ?? [];

  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!modelFile) return res.status(400).json({ error: "A model image is required" });
  if (!productFiles.length || productFiles.length > 5) {
    return res.status(400).json({ error: "Upload between 1 and 5 product images" });
  }

  await assertProject(req.user.id, projectId);
  const modelAsset = await insertUploadAsset({ userId: req.user.id, projectId, kind: "model", file: modelFile });
  const productAssets = [];
  for (const file of productFiles) {
    productAssets.push(await insertUploadAsset({ userId: req.user.id, projectId, kind: "product", file }));
  }

  const generation = await query(
    `INSERT INTO generations (user_id, project_id, model_asset_id, prompt)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [req.user.id, projectId, modelAsset.id, prompt]
  );

  for (const product of productAssets) {
    await query("INSERT INTO generation_products (generation_id, asset_id) VALUES ($1, $2)", [
      generation.rows[0].id,
      product.id
    ]);
  }

  const job = await enqueueBaseGeneration({ userId: req.user.id, generationId: generation.rows[0].id });
  res.status(201).json({ generation: generation.rows[0], job });
}));

router.post("/banner-unfold", upload.fields([
  { name: "banner", maxCount: 1 }
]), asyncHandler(async (req, res) => {
  const projectId = req.body.projectId;
  const bannerFile = req.files?.banner?.[0];
  const body = unfoldSchema.parse(JSON.parse(req.body.unfold ?? "{}"));

  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!bannerFile) return res.status(400).json({ error: "A banner image is required" });

  await assertProject(req.user.id, projectId);
  const bannerAsset = await insertUploadAsset({ userId: req.user.id, projectId, kind: "banner", file: bannerFile });
  const prompt = {
    mode: "banner_unfold",
    source: "BANNER_UNFOLD_MODE",
    instruction: "Use the uploaded finished banner as the source layout and adapt it to the requested dimensions."
  };

  const generation = await query(
    `INSERT INTO generations (user_id, project_id, model_asset_id, prompt, status)
     VALUES ($1, $2, NULL, $3, 'completed')
     RETURNING *`,
    [req.user.id, projectId, prompt]
  );

  await query(
    `INSERT INTO generation_results (generation_id, asset_id, kind, prompt)
     VALUES ($1, $2, 'base', $3)`,
    [generation.rows[0].id, bannerAsset.id, prompt.source]
  );

  const jobs = [];
  for (const presetId of body.presetIds) {
    jobs.push(await enqueueUnfoldGeneration({ userId: req.user.id, generationId: generation.rows[0].id, presetId }));
  }

  res.status(201).json({ generation: generation.rows[0], jobs });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const payload = await generationPayload(req.params.id, req.user.id);
  if (!payload) return res.status(404).json({ error: "Generation not found" });
  res.json(payload);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const client = await pool.connect();
  let storagePaths = [];

  try {
    await client.query("BEGIN");

    const generation = await client.query(
      "SELECT * FROM generations WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [req.params.id, req.user.id]
    );
    if (!generation.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Generation not found" });
    }
    if (generation.rows[0].status === "processing") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Cannot delete a generation while it is processing" });
    }

    const assetResult = await client.query(
      `SELECT DISTINCT a.id, a.storage_path
       FROM assets a
       WHERE a.id = $1
          OR a.id IN (
            SELECT asset_id FROM generation_products WHERE generation_id = $2
          )
          OR a.id IN (
            SELECT asset_id FROM generation_results WHERE generation_id = $2
          )`,
      [generation.rows[0].model_asset_id, req.params.id]
    );
    const assetIds = assetResult.rows.map((asset) => asset.id);
    storagePaths = assetResult.rows.map((asset) => asset.storage_path);

    await client.query("DELETE FROM generations WHERE id = $1", [req.params.id]);
    if (assetIds.length) {
      await client.query("DELETE FROM assets WHERE id = ANY($1::uuid[])", [assetIds]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await Promise.allSettled(storagePaths.map((storagePath) => fs.unlink(absoluteStoragePath(storagePath))));
  res.status(204).send();
}));

router.post("/:id/unfold", asyncHandler(async (req, res) => {
  const generation = await query(
    "SELECT * FROM generations WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.id]
  );
  if (!generation.rowCount) return res.status(404).json({ error: "Generation not found" });
  if (generation.rows[0].status !== "completed") {
    return res.status(409).json({ error: "Base generation must be completed first" });
  }

  const body = unfoldSchema.parse(req.body);
  const jobs = [];
  for (const presetId of body.presetIds) {
    jobs.push(await enqueueUnfoldGeneration({ userId: req.user.id, generationId: req.params.id, presetId }));
  }
  res.status(201).json({ jobs });
}));

router.post("/:id/regenerate-base", asyncHandler(async (req, res) => {
  const generation = await query(
    "SELECT * FROM generations WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.id]
  );
  if (!generation.rowCount) return res.status(404).json({ error: "Generation not found" });
  if (!generation.rows[0].model_asset_id) {
    return res.status(409).json({ error: "Banner unfold generations do not support base regeneration" });
  }

  await query(
    "UPDATE generations SET status = 'pending', error = NULL, updated_at = now() WHERE id = $1",
    [req.params.id]
  );
  const job = await enqueueBaseGeneration({
    userId: req.user.id,
    generationId: req.params.id,
    replaceResult: true
  });
  res.status(201).json({ job });
}));

router.post("/:id/results/:resultId/regenerate", asyncHandler(async (req, res) => {
  const body = regenerateUnfoldSchema.parse(req.body ?? {});
  const result = await query(
    `SELECT gr.*, g.user_id, g.status AS generation_status
     FROM generation_results gr
     JOIN generations g ON g.id = gr.generation_id
     WHERE gr.id = $1 AND gr.generation_id = $2 AND g.user_id = $3`,
    [req.params.resultId, req.params.id, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Result not found" });
  if (result.rows[0].kind !== "unfold" || !result.rows[0].preset_id) {
    return res.status(409).json({ error: "Only unfold results can be regenerated here" });
  }
  if (result.rows[0].generation_status !== "completed") {
    return res.status(409).json({ error: "Generation must be completed before regenerating an unfold" });
  }

  const activeJob = await query(
    `SELECT id FROM jobs
     WHERE generation_id = $1 AND preset_id = $2 AND status IN ('pending', 'processing')
     LIMIT 1`,
    [req.params.id, result.rows[0].preset_id]
  );
  if (activeJob.rowCount) {
    return res.status(409).json({ error: "This unfold is already being processed" });
  }

  const job = await enqueueUnfoldGeneration({
    userId: req.user.id,
    generationId: req.params.id,
    presetId: result.rows[0].preset_id,
    replaceResult: true,
    extraInstructions: body.extraInstructions
  });
  res.status(201).json({ job });
}));

router.delete("/:id/results/:resultId", asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT gr.*, g.user_id, a.storage_path
     FROM generation_results gr
     JOIN generations g ON g.id = gr.generation_id
     JOIN assets a ON a.id = gr.asset_id
     WHERE gr.id = $1 AND gr.generation_id = $2 AND g.user_id = $3`,
    [req.params.resultId, req.params.id, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Result not found" });
  if (result.rows[0].kind !== "unfold") {
    return res.status(409).json({ error: "Base result cannot be deleted here" });
  }

  const activeJob = await query(
    `SELECT id FROM jobs
     WHERE generation_id = $1 AND preset_id = $2 AND status IN ('pending', 'processing')
     LIMIT 1`,
    [req.params.id, result.rows[0].preset_id]
  );
  if (activeJob.rowCount) {
    return res.status(409).json({ error: "Cannot delete an unfold while it is processing" });
  }

  await query("DELETE FROM generation_results WHERE id = $1", [req.params.resultId]);
  await query(
    "DELETE FROM jobs WHERE generation_id = $1 AND preset_id = $2 AND status IN ('completed', 'failed')",
    [req.params.id, result.rows[0].preset_id]
  );
  res.status(204).send();
}));

export default router;
