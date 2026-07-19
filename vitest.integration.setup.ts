import { existsSync } from "node:fs";
import path from "node:path";

// Node's native .env loader (stable since Node 20.6+) — no dependency needed.
const envLocalPath = path.resolve(__dirname, ".env.local");
if (existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath);
}
