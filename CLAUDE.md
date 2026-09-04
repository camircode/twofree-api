# CLAUDE.md — `camircode/twofree-api`

The HTTP boundary and nothing else: NestJS 11 on Express 5, Better Auth, and a
`src/` of controllers, DTOs and one composition root. The domain, persistence,
auth and application layers are published from `camircode/twofree-packages` and
consumed as `@camircode/twofree-*`.

One `Dockerfile` produces two images: the distroless server
(`ghcr.io/camircode/twofree-api`, uid 65532, port 8080) and the migration Job
(`ghcr.io/camircode/twofree-api-migrate`, alpine, uid 10001, no port). The server
stage is last so a bare `docker build .` cannot accidentally produce the image
that can rewrite the schema.

---

## 1. How a change reaches the cluster

Commit to `main` → **Jenkins polls every five minutes** (a webhook is impossible:
the controller is only reachable over WireGuard, so GitHub cannot call it) →
test in a container → `docker buildx` push both images to GHCR **by digest** →
smoke-test both digests → Trivy (HIGH/CRITICAL, `--ignore-unfixed`) → commit the
two digests into `camircode/gitops` → Argo CD syncs.

The pipeline never touches the cluster. The git log of `camircode/gitops` is the
deployment history.

- **Never `kubectl apply`.** Argo CD is the only writer. A manual apply makes the
  cluster and the repository disagree, and Argo either reverts it or reports
  drift forever. `kubectl get/describe/logs/top`, `port-forward` and `exec` are
  fine.
- **Images are referenced by digest, never a tag and never `latest`.** A tag is a
  mutable pointer: two pods started an hour apart from the same tag can run
  different code, and a rollback to a tag rolls back to whatever that tag means
  today. The `:$SHORT_SHA` tags exist so a human can find a build.
- **Secrets come from Bitwarden Secrets Manager only** — never in this repo,
  never in a ConfigMap, never in a plaintext Secret in the GitOps repo, never a
  build `ARG` (it persists in image history and `docker history` prints it back
  to anyone who can pull), never on a command line. The GHCR read token reaches
  the build as a **BuildKit secret mount**; see `--secret id=npmrc` in the
  `Jenkinsfile` and `--mount=type=secret,id=npmrc` in the `Dockerfile`.
- **One PostgreSQL on `data-01`**, with a role and a database per application.
  Never a PostgreSQL per app.
- **Gateway API, never `Ingress`.**
- Infrastructure changes belong in `/home/camir/Desarrollo/infrastructure`.

Containers run non-root, read-only root filesystem, all capabilities dropped,
emptyDir at `/tmp`. Verify a container change by running it that way —
`docker run --user 10001:10001 --read-only --tmpfs /tmp ...` — because this class
of failure never appears in a build and the tests cannot see it: they run against
the source, not the image. That is what the smoke stage exists for.

## 2. The shared packages are a release, not a directory

A change to `@camircode/twofree-*` must be versioned and published from
`twofree-packages` *before* the bump here can install. Bumping to a version that
is not published yet fails in the `deps` stage of the Docker build, minutes into
a Jenkins run, as a resolver error about a tarball.

`pnpm-workspace.yaml` sets `minimumReleaseAgeExclude: ["@camircode/*"]`. pnpm 11
refuses packages published less than a day ago — a good default against a
hijacked release, and a fatal one for first-party packages, because a build
started minutes after `twofree-packages` publishes would fail on its own
dependency. Do not widen that exclusion beyond packages this project owns.

## 3. The Prisma client, and the four ways of getting it wrong

`@camircode/twofree-database` ships `prisma/schema.prisma` and no generated
client, because Prisma 7's generator emits TypeScript. `scripts/prisma-client.mjs`
materialises it, and every non-obvious line in it is load-bearing:

- It **bundles** the generated tree with esbuild rather than transpiling it file
  by file. The generated sources import each other without extensions
  (`"./enums"`, `"./internal/class"`), which Node's ESM resolver rejects with
  `ERR_MODULE_NOT_FOUND`. The API bundle hides this — esbuild resolves those
  specifiers itself — but the migrate image runs the client through plain `node`
  and dies on first import.
- `packages: "external"` keeps `@prisma/client/runtime` pointing at
  `node_modules`; its WebAssembly query compiler must load from its own package
  directory.
- Only JavaScript is emitted, so `PrismaClient` widens to `any` at the package
  boundary. Tolerable *here* — this repo passes the client through and calls
  `$disconnect()`; any repo that writes queries would need declarations too.

`scripts/prune-manifest.mjs` rewrites `package.json` before `pnpm install` in the
image stages. It is not an optimisation: **`pnpm install --prod` does not drop the
Prisma CLI**, because `@prisma/client` declares `prisma` as an optional peer, and
its mere presence in `devDependencies` dragged the CLI, its engines, Studio,
pglite, rolldown, lightningcss and two copies of esbuild into the distroless
image — 399 MB, with a compiler inside an image that is supposed to have no
toolchain. Resolving against a manifest that never mentions them is what keeps
them out (152 MB, 163 packages).

`scripts/migrate.mjs` reassembles the migration preflight from the pieces
`@camircode/twofree-database` exports instead of shelling out to
`pnpm exec prisma`: pnpm 11 runs a dependency-status check before every `exec`,
which in that image tries to write into a root-owned `node_modules` as uid 10001
and dies with `EACCES` before a single migration is looked at. It imports
`inspectDatabase`, `classifyDatabaseState` and `assertMigrationPreflight` rather
than reimplementing them, so the rule that refuses a `partial` or `drift`
database lives in exactly one place.

The migrate image installs its own Alpine tree rather than copying the Debian
one: `@prisma/engines` downloads a schema engine for the platform it was
installed on, and a glibc engine on musl fails with a "not found" naming the
file it just ran.

## 4. `/health` is a readiness probe, not a liveness probe

`PublicController.health()` answers **503** when the database is unreachable
(`src/health.ts`, `databaseReady`). Point liveness at `/version`, which is served
by the same controller without touching the database. Liveness on `/health` means
a database outage kills otherwise healthy containers and turns a recoverable
incident into a crash loop.

## 5. There is no committed lockfile yet

`pnpm-lock.yaml` is gitignored and the image builds run a plain `pnpm install`,
because the `@camircode` packages are not on GitHub Packages yet and a lockfile
resolved against a local link or a local registry pins integrities CI would
reject.

**The first `pnpm install` against the published packages must commit the
lockfile in the same change**, and in that same change switch to
`--frozen-lockfile`: the three `pnpm install` lines in the `Dockerfile` (`deps`,
`runtime-deps`, `migrate-deps`) and the one in the `Jenkinsfile` `Test` stage.
Until then, two builds of the same commit can resolve different trees.

## 6. Working here

```sh
cp .env.example .env      # it refuses to start on the two REPLACE_ME values
pnpm install              # needs a read:packages token in your own ~/.npmrc
pnpm dev
pnpm check                # format:check, lint, typecheck, test — what CI runs
```

`prebuild`, `pretest` and `pretypecheck` all run `pnpm prisma:client` first:
nothing here typechecks without a generated client.
