import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir(".whiteboard/qa", { recursive: true });
await build({
  entryPoints: ["scripts/render-examples.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["jsdom", "@napi-rs/canvas", "canvas"],
  outfile: ".whiteboard/qa/render.mjs",
  logLevel: "warning",
});
const result = spawnSync(process.execPath, [".whiteboard/qa/render.mjs"], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
