# twofree-api

The 2 Free HTTP API: NestJS 11 on Express 5, PostgreSQL through Prisma 7, Better
Auth for sessions. It is bundled with esbuild into a single ESM file and shipped
in a distroless image that listens on **8080**.

The domain, persistence, authentication and application layers are not here.
They are published from `camircode/twofree-packages` to GitHub Packages and
consumed as `@camircode/twofree-*`. This repository is the HTTP boundary and its
delivery.

## Two images from one Dockerfile

| Target    | Image                                   | Purpose                                                                     |
| --------- | --------------------------------------- | --------------------------------------------------------------------------- |
| default   | `ghcr.io/camircode/twofree-api`         | Serves requests. Distroless, uid 65532, read-only filesystem, no shell.     |
| `migrate` | `ghcr.io/camircode/twofree-api-migrate` | Applies the schema. Runs once as a Job, uid 10001, never listens on a port. |

They are separate because they need different privileges at different moments.
The migrate image runs `scripts/migrate.mjs`, which inspects the live schema
before touching it and refuses to migrate a database it classifies as partially
migrated or drifted.

## Deployment

Deployment happens through Jenkins and Argo CD. Nothing here is applied with
`kubectl apply`, by a person or by a pipeline.

Jenkins builds and pushes both images by digest, starts them against a throwaway
PostgreSQL to prove they run, scans them, and then commits those digests to two
lines in `camircode/gitops`:

- `manifests/twofree-api/deployment.yaml`
- `manifests/twofree-api/migrate-job.yaml`

Argo CD reconciles the cluster to that repository. A change made directly against
the cluster is reverted at the next sync, and the git log of `camircode/gitops`
is the deployment history.

## Local development

```sh
cp .env.example .env    # then replace the two values it refuses to start with
pnpm install
pnpm dev
```

`pnpm install` needs a GitHub Packages read token for the `@camircode` scope in
your own `~/.npmrc`; the repository's `.npmrc` maps the scope but carries no
credential.

| Command              | What it does                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm prisma:client` | Generates and compiles the Prisma client the database package does not publish. Run automatically before build, test and typecheck. |
| `pnpm build`         | Bundles `src/main.ts` and the generated client into `dist/main.js`.                                                                 |
| `pnpm test`          | Vitest, including one test that boots the whole Nest application.                                                                   |
| `pnpm check`         | Format, lint, typecheck and test — what CI runs.                                                                                    |

## No lockfile, for now

`pnpm-lock.yaml` is not committed and the image builds run a plain
`pnpm install`. The `@camircode/twofree-*` packages are not on GitHub Packages
yet, so no lockfile resolved against that registry can exist; one produced from a
local link or a local registry pins tarball integrities that CI would reject.
Once the packages are published, generate the lockfile, commit it, and change
the three `pnpm install` lines in the `Dockerfile` and the one in the
`Jenkinsfile` to `pnpm install --frozen-lockfile`.
