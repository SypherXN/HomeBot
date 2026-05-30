#!/usr/bin/env node
/**
 * Generate TypeScript types from the running HomeBot OpenAPI document.
 * Usage: npm run openapi:types
 * Env: HOMEBOT_OPENAPI_URL (default http://127.0.0.1:5050/openapi/v1.json)
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "src", "generated", "openapi.d.ts");
const url = process.env.HOMEBOT_OPENAPI_URL ?? "http://127.0.0.1:5050/openapi/v1.json";

mkdirSync(dirname(outFile), { recursive: true });

console.log(`Fetching OpenAPI from ${url} …`);
execSync(`npx --yes openapi-typescript@7.10.1 "${url}" -o "${outFile}"`, {
  cwd: root,
  stdio: "inherit",
});
console.log(`Wrote ${outFile}`);
