await Bun.build({
  entrypoints: ["./src/index.js"],
  outdir: "./dist",
  format: "esm",
  target: "node",
  minify: true,
  splitting: true,
  sourcemap: "linked",
  external: ["hono", "hono/*", "@hono/*", "node:net"],
});

console.log("Build complete!");