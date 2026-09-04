// Rewrites package.json in place, keeping only the development dependencies
// named on the command line (none, if none are named).
//
// This runs before `pnpm install` in the image stages, and it is not an
// optimisation. `pnpm install --prod` skips direct development dependencies but
// still links optional peer dependencies that the full manifest happens to
// satisfy: @prisma/client declares `prisma` as an optional peer, so the mere
// presence of the Prisma CLI in devDependencies dragged the CLI, its engines,
// Prisma Studio, pglite, rolldown, lightningcss and two copies of esbuild into
// the distroless image — 399 MB and a compiler inside the image that is
// supposed to have no toolchain at all. Resolving against a manifest that never
// mentions them is what actually keeps them out (152 MB, 163 packages).
//
// Used with arguments by the migration image, which needs exactly two of them:
// the Prisma CLI, which applies the migrations, and esbuild, which compiles the
// generated client.

import { readFileSync, writeFileSync } from "node:fs";

const keep = new Set(process.argv.slice(2));
const manifest = JSON.parse(readFileSync("package.json", "utf8"));

const kept = Object.fromEntries(
  Object.entries(manifest.devDependencies ?? {}).filter(([name]) => keep.has(name)),
);
const missing = [...keep].filter((name) => !(name in kept));
if (missing.length > 0) {
  throw new Error(`package.json has no devDependencies named ${missing.join(", ")}`);
}

if (Object.keys(kept).length > 0) manifest.devDependencies = kept;
else delete manifest.devDependencies;

writeFileSync("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifest pruned to ${Object.keys(kept).length} development dependencies.`);
