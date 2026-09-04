// Compiles the Prisma client that @camircode/twofree-database deliberately does
// not publish.
//
// Prisma 7's `prisma-client` generator emits TypeScript, not JavaScript, so a
// generated client cannot be shipped inside a package that is consumed as
// plain ESM. The published tarball therefore excludes dist/generated (see the
// "files" field of the database package) and ships prisma/schema.prisma and
// prisma.config.ts instead. What it does ship — dist/client.js — imports
// "./generated/client/client.js", a path that does not exist until this script
// has run.
//
// Skipping it fails in two different places at two different times: the API
// bundle stops at build time with an esbuild resolve error, and the migrate
// image — which does not bundle — starts fine and dies on its first import.
// Neither message mentions Prisma.
//
// One thing this does not restore is the type surface. Only JavaScript is
// emitted, so `PrismaClient` widens to `any` at the package boundary. That is
// tolerable here and nowhere else: this repository holds a Nest HTTP layer that
// passes the client to the database package and calls $disconnect() on
// shutdown. Any repository that writes queries wants declarations too.
//
// Two steps, in this order:
//
//   1. `prisma generate`, which writes TypeScript to <package>/src/generated/client
//      (the output path is baked into the published schema, relative to it).
//   2. An esbuild bundle of that tree into the single
//      <package>/dist/generated/client/client.js that dist/client.js imports.
//
// Step 2 bundles rather than transpiling file by file, and that is not a
// preference. The generated sources import each other without extensions
// ("./enums", "./internal/class"), and neither tsc nor a per-file esbuild
// transform rewrites a specifier — so a file-for-file build produces JavaScript
// that Node's ESM resolver rejects with ERR_MODULE_NOT_FOUND. The API bundle
// would hide that, because esbuild resolves those specifiers itself, but the
// migrate image runs this client through plain `node` and would die on the
// first import. Bundling resolves them once, at build time.
//
// `packages: "external"` keeps every bare specifier — above all
// @prisma/client/runtime, which loads the WebAssembly query compiler from its
// own package directory — pointing at node_modules instead of being inlined.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const require = createRequire(import.meta.url);
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

// The package exports map has no "./package.json" entry, so the root is derived
// from the main entry point (<root>/dist/index.js) instead of resolved directly.
const packageRoot = dirname(dirname(require.resolve("@camircode/twofree-database")));
const generatedSource = join(packageRoot, "src", "generated", "client");
const generatedOutput = join(packageRoot, "dist", "generated", "client");

function generate() {
  // Run from the package root: prisma.config.ts resolves ./prisma/schema.prisma
  // relative to itself, and the schema resolves its generator output relative to
  // the schema. Both are the package's own paths, not this repository's.
  const prisma = join(repositoryRoot, "node_modules", ".bin", "prisma");
  const result = spawnSync(prisma, ["generate"], {
    cwd: packageRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`prisma generate failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function compile() {
  const entryPoint = join(generatedSource, "client.ts");
  if (!existsSync(entryPoint)) {
    throw new Error(`prisma generate wrote no client to ${generatedSource}`);
  }
  await build({
    entryPoints: [entryPoint],
    outfile: join(generatedOutput, "client.js"),
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    target: "node24",
    logLevel: "warning",
  });
}

// Idempotent on purpose. The build stage, the test stage and a developer's
// working tree all call this, and a workspace checked out with a local link to
// the database package already carries a compiled client.
if (existsSync(join(generatedOutput, "client.js"))) {
  console.log(`Prisma client already compiled at ${generatedOutput}`);
} else {
  generate();
  await compile();
  console.log(`Compiled the generated Prisma client into ${generatedOutput}`);
}
