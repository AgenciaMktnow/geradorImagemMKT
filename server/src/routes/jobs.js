import { Router } from "express";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";
import { retryJob } from "../jobs/processor.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT j.*, dp.name AS preset_name, dp.width, dp.height
     FROM jobs j
     LEFT JOIN dimension_presets dp ON dp.id = j.preset_id
     WHERE j.user_id = $1
     ORDER BY j.created_at DESC
     LIMIT 100`,
    [req.user.id]
  );
  res.json({ jobs: result.rows });
}));

router.post("/:id/retry", asyncHandler(async (req, res) => {
  const job = await retryJob({ userId: req.user.id, jobId: req.params.id });
  if (!job) return res.status(404).json({ error: "Failed job not found" });
  res.json({ job });
}));

export default router;
