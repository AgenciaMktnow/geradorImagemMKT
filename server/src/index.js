import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startJobWorker } from "./jobs/processor.js";
import { ensureStorage } from "./storage/paths.js";

await ensureStorage();

const app = createApp();
app.listen(env.port, () => {
  startJobWorker();
  console.log(`API running on http://localhost:${env.port}`);
});
