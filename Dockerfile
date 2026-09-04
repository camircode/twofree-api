# syntax=docker/dockerfile:1

# Two images come out of this file:
#
#   (default)  ghcr.io/camircode/twofree-api          — the distroless server
#   --target migrate  ghcr.io/camircode/twofree-api-migrate — the schema Job
#
# The server stage is last so that a bare `docker build .` produces the image
# that takes traffic, never the one that can rewrite the schema.
#
# Multi-stage so the toolchain never reaches the running image. A bundler, a
# package manager, the Prisma CLI and a test runner in production are attack
# surface that does nothing once the build is over.
#
# The builder stages are Debian, not Alpine, because the final image is
# Debian-based distroless and the resolved node_modules tree is copied into it
# unchanged. A tree resolved against musl and executed against glibc fails as a
# missing symbol at startup, in a container with no shell to ask about it.

# --- dependencies -------------------------------------------------------------
# Its own stage, and only the manifests are copied, so this layer is reused
# unless a manifest changes. Ordinary code changes do not re-resolve the tree.
#
# The @camircode packages are private on GitHub Packages, so the resolver needs
# a read token. It arrives as a BuildKit secret mounted for the duration of one
# RUN: not an ARG, which is recorded in the image history, and not a COPY, which
# is a layer anyone who pulls the image can read.
FROM node:24-bookworm-slim AS deps
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-workspace.yaml .npmrc ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc pnpm install

# --- build --------------------------------------------------------------------
# `pnpm build` is two steps: scripts/prisma-client.mjs materialises the Prisma
# client that @camircode/twofree-database deliberately does not publish, and then
# esbuild bundles src/main.ts — and the generated client with it — into one file.
# The order matters and is enforced by the prebuild script, not by this file.
FROM node:24-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY --from=deps /src/node_modules ./node_modules
COPY package.json pnpm-workspace.yaml tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN pnpm build

# --- runtime dependencies -----------------------------------------------------
# Resolved separately from the build tree, and from a manifest with its
# development dependencies removed first — see scripts/prune-manifest.mjs, which
# exists because --prod alone still drags the Prisma CLI in behind an optional
# peer dependency. What survives is the short list the bundle deliberately left
# external: Nest, Express, better-auth, pg and @prisma/client, whose WebAssembly
# query compiler has to load from its own package directory.
FROM node:24-bookworm-slim AS runtime-deps
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY scripts/prune-manifest.mjs ./scripts/
RUN node scripts/prune-manifest.mjs
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc pnpm install --prod

# --- migration dependencies ---------------------------------------------------
# Alpine, and its own install rather than a copy of the one above, because a
# node_modules tree cannot be shared across libc implementations: @prisma/engines
# downloads a schema engine binary for the platform it was installed on, and a
# glibc engine on musl fails with a "not found" that names the file it just ran.
#
# This tree keeps exactly two development dependencies, and no others: the
# Prisma CLI, which is what actually applies the migrations, and esbuild, which
# compiles the generated client. A test runner, a linter and TypeScript have no
# business in an image that runs against the production database.
FROM node:24-alpine AS migrate-deps
WORKDIR /app
# Prisma's schema engine is dynamically linked against OpenSSL 3. Alpine ships
# without it, and the engine then fails to start with an error about a library
# rather than about the migration.
RUN apk add --no-cache openssl && corepack enable
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY scripts ./scripts
RUN node scripts/prune-manifest.mjs prisma esbuild
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc pnpm install
RUN pnpm prisma:client

# --- the migration image ------------------------------------------------------
FROM node:24-alpine AS migrate
ENV NODE_ENV=production
WORKDIR /app

# No package manager here. scripts/migrate.mjs spawns the Prisma binary itself,
# so nothing at runtime needs pnpm, npm or corepack — which is what keeps this
# image from trying to download a package manager as uid 10001 into a home
# directory it does not own.
#
# openssl is Prisma's schema engine dependency: without it the engine fails to
# start with an error about a shared library instead of about the migration.
# postgresql17-client is pg_dump and pg_restore, which the package uses to take
# and verify a snapshot when ROLLBACK_SNAPSHOT_PATH is set. Absent them, the one
# run where that snapshot matters is the run that discovers they are missing.
#
# The user is a real account rather than a bare uid so /etc/passwd resolves it:
# a numeric --user with no passwd entry gets HOME=/, and the first tool that
# tries to write beside it fails on a read-only root filesystem.
RUN apk add --no-cache openssl postgresql17-client \
 && addgroup -g 10001 -S migrate \
 && adduser -u 10001 -S -G migrate -h /home/migrate migrate

COPY --from=migrate-deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts/migrate.mjs ./scripts/migrate.mjs

# A Job, not a server: no port, and an unprivileged uid that owns nothing it
# writes. It matches the runAsUser of the Job manifest so that "works in the
# pipeline" and "works in the cluster" are the same statement.
USER 10001:10001

CMD ["node", "scripts/migrate.mjs"]

# --- the image that runs ------------------------------------------------------
# Distroless carries no shell, no package manager and no libc beyond what Node
# needs. Anyone who gets code execution in this container arrives somewhere with
# nothing to use.
FROM gcr.io/distroless/nodejs24-debian13:nonroot

ENV NODE_ENV=production

WORKDIR /app

# The package.json travels with the image and is not optional: it is what
# declares "type": "module". dist/main.js is ESM, and without that declaration
# Node parses a .js file as CommonJS and the process dies on the first `import`
# — a crash loop whose message says nothing about a missing manifest.
COPY package.json ./
COPY --from=runtime-deps /src/node_modules ./node_modules
COPY --from=build /src/dist ./dist

# 127.0.0.1 is the default the shared configuration loader carries for a laptop.
# A process bound to it inside a pod answers nobody: not the Service, and not
# the kubelet running the readiness probe, which reports a failure that looks
# like the application never started.
ENV API_HOST=0.0.0.0

# Matches runAsNonRoot in the Deployment. Declaring it here as well means the
# image is safe to run without a securityContext rather than depending on one.
USER 65532:65532

EXPOSE 8080

# distroless/nodejs already has node as its entrypoint, so this is the script.
CMD ["/app/dist/main.js"]
