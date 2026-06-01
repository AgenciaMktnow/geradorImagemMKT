import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();
const presetSchema = z.object({
  name: z.string().trim().min(2).max(80),
  width: z.coerce.number().int().min(128).max(8192),
  height: z.coerce.number().int().min(128).max(8192),
  channel: z.string().trim().min(2).max(40).optional().default("custom")
});

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM dimension_presets
     WHERE (user_id IS NULL OR user_id = $1)
       AND deleted_at IS NULL
     ORDER BY is_custom, channel, width, height`,
    [req.user.id]
  );
  res.json({ presets: result.rows });
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const body = presetSchema.parse(req.body);
  const slug = `${body.name}-${body.width}x${body.height}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const result = await query(
    `INSERT INTO dimension_presets (user_id, slug, name, width, height, channel, is_custom)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     RETURNING *`,
    [req.user.id, `${slug}-${Date.now()}`, body.name, body.width, body.height, body.channel]
  );
  res.status(201).json({ preset: result.rows[0] });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const preset = await query(
    `SELECT * FROM dimension_presets
     WHERE id = $1 AND user_id = $2 AND is_custom = true AND deleted_at IS NULL`,
    [req.params.id, req.user.id]
  );
  if (!preset.rowCount) return res.status(404).json({ error: "Custom preset not found" });

  const activeJob = await query(
    `SELECT id FROM jobs
     WHERE preset_id = $1 AND user_id = $2 AND status IN ('pending', 'processing')
     LIMIT 1`,
    [req.params.id, req.user.id]
  );
  if (activeJob.rowCount) {
    return res.status(409).json({ error: "Cannot delete a preset while it is being processed" });
  }

  await query(
    "UPDATE dimension_presets SET deleted_at = now() WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.id]
  );
  res.status(204).send();
}));

export default router;
