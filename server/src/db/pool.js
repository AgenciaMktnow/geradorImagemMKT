import pg from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({
  connectionString: env.databaseUrl
});

export async function query(text, params = []) {
  return pool.query(text, params);
}
