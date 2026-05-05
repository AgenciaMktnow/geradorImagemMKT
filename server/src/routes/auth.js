import { Router } from "express";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signToken } from "../auth/tokens.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).optional()
});

router.post("/register", asyncHandler(async (req, res) => {
  const body = authSchema.parse(req.body);
  const passwordHash = await hashPassword(body.password);
  const result = await query(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, email, name, created_at`,
    [body.email.toLowerCase(), passwordHash, body.name ?? null]
  );
  const user = result.rows[0];
  res.status(201).json({ user, token: signToken(user) });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const body = authSchema.pick({ email: true, password: true }).parse(req.body);
  const result = await query("SELECT * FROM users WHERE email = $1", [body.email.toLowerCase()]);
  if (!result.rowCount) return res.status(401).json({ error: "Invalid email or password" });

  const user = result.rows[0];
  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  res.json({
    user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at },
    token: signToken(user)
  });
}));

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
