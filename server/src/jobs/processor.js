import { query } from "../db/pool.js";
import { env } from "../config/env.js";
import { getAiProvider } from "../providers/index.js";
import { buildBasePrompt, buildUnfoldPrompt } from "../utils/prompt.js";

let timer = null;
let activeJobs = 0;
let draining = false;

export async function enqueueBaseGeneration({ userId, generationId, replaceResult = false }) {
  const result = await query(
    "INSERT INTO jobs (user_id, generation_id, type, payload) VALUES ($1, $2, 'base_generation', $3) RETURNING *",
    [userId, generationId, { replaceResult }]
  );
  return result.rows[0];
}

export async function enqueueUnfoldGeneration({ userId, generationId, presetId, replaceResult = false, extraInstructions = "" }) {
  const result = await query(
    `INSERT INTO jobs (user_id, generation_id, type, preset_id, payload)
     VALUES ($1, $2, 'unfold_generation', $3, $4)
     RETURNING *`,
    [userId, generationId, presetId, { replaceResult, extraInstructions }]
  );
  return result.rows[0];
}

export async function retryJob({ userId, jobId }) {
  const result = await query(
    `UPDATE jobs
     SET status = 'pending', error = NULL, started_at = NULL, completed_at = NULL
     WHERE id = $1 AND user_id = $2 AND status = 'failed'
     RETURNING *`,
    [jobId, userId]
  );
  return result.rows[0] ?? null;
}

async function claimJob() {
  await releaseStaleJobs();
  const result = await query(
    `UPDATE jobs
     SET status = 'processing', attempts = attempts + 1, started_at = now(), error = NULL
     WHERE id = (
       SELECT id FROM jobs
       WHERE status = 'pending' AND attempts < max_attempts
       ORDER BY
         CASE WHEN type = 'base_generation' THEN 0 ELSE 1 END,
         created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`
  );
  return result.rows[0] ?? null;
}

async function releaseStaleJobs() {
  await query(
    `UPDATE jobs
     SET status = 'pending',
         error = 'Job was restarted after exceeding the processing timeout',
         started_at = NULL
     WHERE status = 'processing'
       AND started_at < now() - ($1::int * interval '1 minute')
       AND attempts < max_attempts`,
    [env.staleJobMinutes]
  );
  await query(
    `UPDATE jobs
     SET status = 'failed',
         error = 'Job exceeded the processing timeout',
         completed_at = now()
     WHERE status = 'processing'
       AND started_at < now() - ($1::int * interval '1 minute')
       AND attempts >= max_attempts`,
    [env.staleJobMinutes]
  );
}

async function getGenerationContext(generationId) {
  const generation = await query("SELECT * FROM generations WHERE id = $1", [generationId]);
  if (!generation.rowCount) throw new Error("Generation not found");

  const modelAsset = await query("SELECT * FROM assets WHERE id = $1", [generation.rows[0].model_asset_id]);
  const products = await query(
    `SELECT a.* FROM assets a
     JOIN generation_products gp ON gp.asset_id = a.id
     WHERE gp.generation_id = $1
     ORDER BY a.created_at`,
    [generationId]
  );

  return {
    generation: generation.rows[0],
    modelAsset: modelAsset.rows[0],
    productAssets: products.rows
  };
}

async function insertGeneratedAsset({ userId, projectId, image, originalName }) {
  const result = await query(
    `INSERT INTO assets (user_id, project_id, kind, original_name, mime_type, size_bytes, storage_path, width, height)
     VALUES ($1, $2, 'generated', $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, projectId, originalName, image.mimeType, image.sizeBytes, image.storagePath, image.width, image.height]
  );
  return result.rows[0];
}

async function processBaseJob(job) {
  const provider = getAiProvider();
  const { generation, modelAsset, productAssets } = await getGenerationContext(job.generation_id);
  const prompt = buildBasePrompt(generation.prompt);

  await query("UPDATE generations SET status = 'processing', updated_at = now() WHERE id = $1", [generation.id]);
  const image = await provider.generateBase({ prompt, modelAsset, productAssets });
  const asset = await insertGeneratedAsset({
    userId: generation.user_id,
    projectId: generation.project_id,
    image,
    originalName: `${provider.name}-base-${generation.id}`
  });

  if (job.payload?.replaceResult) {
    await query("DELETE FROM generation_results WHERE generation_id = $1 AND kind = 'base'", [generation.id]);
  }

  await query(
    `INSERT INTO generation_results (generation_id, asset_id, kind, prompt)
     VALUES ($1, $2, 'base', $3)`,
    [generation.id, asset.id, prompt]
  );
  await query("UPDATE generations SET status = 'completed', error = NULL, updated_at = now() WHERE id = $1", [generation.id]);
}

async function processUnfoldJob(job) {
  const provider = getAiProvider();
  const { generation } = await getGenerationContext(job.generation_id);
  const presetResult = await query("SELECT * FROM dimension_presets WHERE id = $1", [job.preset_id]);
  if (!presetResult.rowCount) throw new Error("Dimension preset not found");

  const baseResult = await query(
    `SELECT a.*, gr.prompt AS base_prompt FROM generation_results gr
     JOIN assets a ON a.id = gr.asset_id
     WHERE gr.generation_id = $1 AND gr.kind = 'base'
     ORDER BY gr.created_at DESC
     LIMIT 1`,
    [generation.id]
  );
  if (!baseResult.rowCount) throw new Error("Base image must be completed before unfolding");

  const preset = presetResult.rows[0];
  const prompt = buildUnfoldPrompt(baseResult.rows[0].base_prompt, preset, job.payload?.extraInstructions);
  const image = await provider.generateUnfold({ prompt, baseAsset: baseResult.rows[0], preset });
  const asset = await insertGeneratedAsset({
    userId: generation.user_id,
    projectId: generation.project_id,
    image,
    originalName: `${provider.name}-${preset.slug}-${generation.id}`
  });

  if (job.payload?.replaceResult) {
    await query(
      "DELETE FROM generation_results WHERE generation_id = $1 AND preset_id = $2 AND kind = 'unfold'",
      [generation.id, preset.id]
    );
  }

  await query(
    `INSERT INTO generation_results (generation_id, preset_id, asset_id, kind, prompt)
     VALUES ($1, $2, $3, 'unfold', $4)`,
    [generation.id, preset.id, asset.id, prompt]
  );
}

async function completeJob(job) {
  await query("UPDATE jobs SET status = 'completed', completed_at = now(), error = NULL WHERE id = $1", [job.id]);
}

function normalizeJobError(error) {
  if (!error?.message) return "Job failed";
  try {
    const parsed = JSON.parse(error.message);
    return parsed.error?.message ?? error.message;
  } catch {
    return error.message;
  }
}

async function failJob(job, error) {
  const shouldRetry = job.attempts < job.max_attempts;
  const message = normalizeJobError(error);
  await query(
    `UPDATE jobs
     SET status = $2, error = $3, completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE completed_at END
     WHERE id = $1`,
    [job.id, shouldRetry ? "pending" : "failed", message]
  );
  if (!shouldRetry && job.type === "base_generation") {
    await query("UPDATE generations SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [
      job.generation_id,
      message
    ]);
  }
}

async function runClaimedJob(job) {
  activeJobs += 1;
  try {
    if (job.type === "base_generation") await processBaseJob(job);
    if (job.type === "unfold_generation") await processUnfoldJob(job);
    await completeJob(job);
  } catch (error) {
    await failJob(job, error);
  } finally {
    activeJobs -= 1;
  }
}

export async function processNextJob() {
  const job = await claimJob();
  if (!job) return false;

  await runClaimedJob(job);
  return true;
}

async function drainQueue() {
  if (draining) return;
  draining = true;
  try {
    while (activeJobs < env.jobConcurrency) {
      const job = await claimJob();
      if (!job) break;
      runClaimedJob(job);
    }
  } finally {
    draining = false;
  }
}

export function startJobWorker() {
  if (timer) return;
  timer = setInterval(drainQueue, 1000);
  drainQueue();
}

export function stopJobWorker() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
