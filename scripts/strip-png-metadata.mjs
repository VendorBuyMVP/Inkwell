#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const roots = process.argv.slice(2);
const targets = roots.length > 0 ? roots : ["app/assets"];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const keptChunks = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "pHYs"]);

function collect(path) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    return readdirSync(path).flatMap((entry) => collect(join(path, entry)));
  }
  return path.endsWith(".png") ? [path] : [];
}

function stripPng(path) {
  const source = readFileSync(path);
  if (!source.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`${path} is not a PNG`);
  }

  const chunks = [pngSignature];
  let offset = 8;
  let removed = 0;

  while (offset < source.length) {
    const length = source.readUInt32BE(offset);
    const type = source.toString("ascii", offset + 4, offset + 8);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > source.length) {
      throw new Error(`${path} has an invalid PNG chunk`);
    }

    const chunk = source.subarray(offset, chunkEnd);
    if (keptChunks.has(type)) {
      chunks.push(chunk);
    } else {
      removed += 1;
    }

    offset = chunkEnd;
    if (type === "IEND") {
      break;
    }
  }

  if (removed > 0) {
    writeFileSync(path, Buffer.concat(chunks));
  }

  return removed;
}

let totalRemoved = 0;
for (const target of targets) {
  for (const file of collect(target)) {
    const removed = stripPng(file);
    totalRemoved += removed;
    if (removed > 0) {
      console.log(`${file}: removed ${removed} metadata chunks`);
    }
  }
}

console.log(`PNG metadata strip complete; removed ${totalRemoved} chunks`);
