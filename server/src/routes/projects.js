import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();
const projectSchema = z.object({ name: z.string().trim().min(1).max(120) });

router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT p.*,
      COUNT(g.id)::int AS generation_count,
      MAX(g.created_at) AS last_generation_at
     FROM projects p
     LEFT JOIN generations g ON g.project_id = p.id
     WHERE p.user_id = $1
     GROUP BY p.id
     ORDER BY p.updated_at DESC`,
    [req.user.id]
  );
  res.json({ projects: result.rows });
}));

router.post("/", asyncHandler(async (req, res) => {
  const body = projectSchema.parse(req.body);
  const result = await query(
    "INSERT INTO projects (user_id, name) VALUES ($1, $2) RETURNING *",
    [req.user.id, body.name]
  );
  res.status(201).json({ project: result.rows[0] });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM projects WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Project not found" });
  res.json({ project: result.rows[0] });
}));

export default router;
