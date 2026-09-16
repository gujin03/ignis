const esbuild = require("esbuild");
const sveltePlugin = require("esbuild-svelte");
const path = require("path");

module.exports = esbuild.build({
  entryPoints: [path.join(__dirname, "src", "index.js")],
  bundle: true,
  outfile: path.join(__dirname, "dist", "ignis-ui.js"),
  format: "iife",
  globalName: "IgnisUI",
  platform: "browser",
  target: ["chrome90"],
  mainFields: ["svelte", "browser", "module", "main"],
  conditions: ["svelte", "browser"],
  plugins: [sveltePlugin({ compilerOptions: { css: "injected" } })],
  logLevel: "info",
});
