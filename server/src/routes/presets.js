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
     WHERE user_id IS NULL OR user_id = $1
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

export default router;
