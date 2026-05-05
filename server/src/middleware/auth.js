import { verifyToken } from "../auth/tokens.js";
import { query } from "../db/pool.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    const payload = verifyToken(token);
    const result = await query("SELECT id, email, name, created_at FROM users WHERE id = $1", [payload.sub]);
    if (!result.rowCount) return res.status(401).json({ error: "Invalid session" });
    req.user = result.rows[0];
    next();
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
}
