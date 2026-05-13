import { rm } from "node:fs/promises";
import { $ } from "bun";

await rm("./dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "node",
  format: "esm",
  minify: false,
  splitting: false,
  sourcemap: "external",
  packages: "external",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

await $`bun x tsc -p tsconfig.build.json`;

console.log(`Build complete: ${result.outputs.length} files`);
