#!/usr/bin/env node
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outfile = resolve("app/frontend/editor-bundle.js");
mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [resolve("app/frontend/editor-engine.js")],
  outfile,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  legalComments: "eof",
  banner: {
    js: "/* Bundled local editor formatting primitives from Tiptap/ProseMirror packages. */",
  },
});
