// Entry point of the twofree-api-migrate image.
//
// This is migrateDatabase() from @camircode/twofree-database, reassembled from
// the pieces that package exports, and it is reassembled for one reason:
// migrateDatabase() reaches the Prisma CLI through `pnpm exec`, and pnpm 11
// runs a dependency-status check before every exec. In this image that check
// decides the tree is stale, tries to run `pnpm install` into a root-owned
// node_modules as uid 10001, and the Job dies with EACCES on a temp file in
// .pnpm/ — before a single migration is looked at. Spawning the Prisma binary
// directly removes the package manager from the runtime path entirely.
//
// What is NOT reimplemented here is the safety. inspectDatabase,
// classifyDatabaseState and assertMigrationPreflight are imported, so the rule
// that decides whether this database may be migrated at all lives in exactly
// one place. A database it classifies as "partial" (a half-applied migration)
// or "drift" (a legacy schema whose columns no longer match the baseline) is
// refused. `prisma migrate deploy` on its own would happily continue.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertMigrationPreflight,
  classifyDatabaseState,
  createPrismaClient,
  createRollbackSnapshot,
  inspectDatabase,
  LEGACY_BASELINE_MIGRATION,
  verifyRollbackSnapshot,
} from "@camircode/twofree-database";

const require = createRequire(import.meta.url);
const applicationRoot = fileURLToPath(new URL("..", import.meta.url));
const prismaBin = join(applicationRoot, "node_modules", ".bin", "prisma");

// The CLI has to run from the database package's own directory: prisma.config.ts
// and prisma/migrations are shipped inside the package, and every path in them
// is relative to it. The exports map has no "./package.json" entry, so the root
// is derived from the main entry point.
const packageRoot = dirname(dirname(require.resolve("@camircode/twofree-database")));

function runPrisma(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(prismaBin, args, { cwd: packageRoot, env: process.env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function migrate() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL must be configured before migration");
  }

  // Optional, and taken before anything is altered: a dump that is never
  // restored is not a backup, so the snapshot is verified with pg_restore
  // --list immediately after it is written.
  if (process.env.ROLLBACK_SNAPSHOT_PATH?.trim()) {
    await createRollbackSnapshot(process.env);
    await verifyRollbackSnapshot(process.env);
  }

  const prisma = createPrismaClient(process.env.DATABASE_URL);
  try {
    const snapshot = await inspectDatabase(prisma);
    const state = classifyDatabaseState(snapshot);
    assertMigrationPreflight(state);

    // A database that predates Prisma carries the original schema but no
    // _prisma_migrations table. Marking the baseline as applied is what stops
    // `migrate deploy` from trying to create tables that already hold data.
    if (state === "existing" && snapshot.foundationSchema !== "valid") {
      await runPrisma(["migrate", "resolve", "--applied", LEGACY_BASELINE_MIGRATION]);
    }

    await runPrisma(["migrate", "deploy"]);
    return state;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

try {
  const state = await migrate();
  console.log(`Migrations applied. The database was in the "${state}" state beforehand.`);
} catch (error) {
  // Non-zero on purpose: the Job must fail loudly rather than let the API roll
  // out against a schema that was never migrated.
  console.error(error instanceof Error ? error.message : "Database migration failed");
  process.exit(1);
}
