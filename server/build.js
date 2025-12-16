import { build } from "bun";

await build({
  entrypoints: ["src/server.ts"],
  outdir: "dist",
  target: "node",
  format: "esm",
});
