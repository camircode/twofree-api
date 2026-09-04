// Bundles src/main.ts into the single dist/main.js the image runs.
//
// The esbuild JavaScript API is used instead of the CLI on purpose. pnpm writes
// node_modules/.bin/esbuild before esbuild's own install script replaces
// bin/esbuild with the platform binary, and when those two steps land in that
// order the shim tries to run an ELF file through node and dies with
// "SyntaxError: Invalid or unexpected token". Which order you get depends on
// install timing, which is exactly the kind of build that works on a laptop and
// fails in CI. The API loads the binary itself and never touches the shim.

import { build } from "esbuild";

// Kept out of the bundle. Each of these is resolved at runtime by something the
// bundler cannot see: Nest's optional `require`s of its own platform packages,
// better-auth's dynamic adapter loading, reflect-metadata's global patching,
// and @prisma/client, whose WebAssembly query compiler must be loaded from
// inside its own package directory. Everything else — including the shared
// @camircode packages and the generated Prisma client — is inlined, which is
// what lets the runtime image ship a --prod dependency tree.
const external = [
  "@nestjs/*",
  "@thallesp/*",
  "@prisma/*",
  "better-auth",
  "class-transformer",
  "class-validator",
  "express",
  "pg",
  "qs",
  "reflect-metadata",
  "rxjs",
];

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  external,
  logLevel: "info",
});
