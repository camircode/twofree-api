// Builds both images, pushes them to GHCR by digest, and commits those digests
// to the GitOps repository.
//
// This pipeline never touches the cluster. Argo CD does the deploying, and the
// only thing Jenkins changes is two lines in git — which is why the git log of
// camircode/gitops is the real deployment history.
//
// Two images, because the schema and the server change on different schedules
// and with different privileges: the API image serves requests and can do
// nothing to the schema, the migrate image can rewrite the schema and never
// listens on a port.

pipeline {
    agent { label 'docker' }

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }

    environment {
        REGISTRY         = 'ghcr.io'
        IMAGE            = 'ghcr.io/camircode/twofree-api'
        MIGRATE_IMAGE    = 'ghcr.io/camircode/twofree-api-migrate'
        GITOPS           = 'git@github.com:camircode/gitops.git'
        MANIFEST         = 'manifests/twofree-api/deployment.yaml'
        MIGRATE_MANIFEST = 'manifests/twofree-api/migrate-job.yaml'

        // The shared @camircode packages are private on GitHub Packages, so
        // every install in this pipeline needs a read token. It is written once
        // to a file outside the image and outside git, mounted where it is
        // needed, and removed in post{always}. It is never a build ARG: an ARG
        // is recorded in the image history, where anyone who can pull the image
        // can read it back.
        NPMRC = "${WORKSPACE}/.npmrc.ci"
    }

    stages {
        stage('Test') {
            steps {
                // In a container rather than on the agent, so the agent does not
                // accumulate a toolchain per language it ever built.
                //
                // The flags that are not decoration:
                //
                //   -u and HOME=/tmp, so node_modules is not left behind owned
                //   by root for cleanWs() to fail on, and corepack has somewhere
                //   to write.
                //
                //   /etc/passwd and /etc/group read-only, because a uid mapped
                //   in with -u does not exist inside the image, and anything
                //   that calls os.userInfo() then fails with a bare ENOENT
                //   naming no path. This does not reproduce on a workstation
                //   whose uid happens to be 1000 — node:24 already has a user
                //   there.
                //
                //   The token file mounted at $HOME/.npmrc, because `pnpm
                //   install` is the first thing that runs and the private
                //   packages are most of the dependency tree.
                withCredentials([usernamePassword(
                    credentialsId: 'ghcr',
                    usernameVariable: 'GHCR_USER',
                    passwordVariable: 'GHCR_PASS',
                )]) {
                    sh '''
                        set -eu
                        umask 077
                        cat > "$NPMRC" <<EOF
@camircode:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GHCR_PASS}
EOF

                        docker run --rm \
                          -u "$(id -u):$(id -g)" \
                          -v /etc/passwd:/etc/passwd:ro \
                          -v /etc/group:/etc/group:ro \
                          -e HOME=/tmp -e CI=true \
                          -v "$NPMRC":/tmp/.npmrc:ro \
                          -v "$PWD":/src -w /src \
                          node:24 \
                          sh -c '
                            set -eu
                            # The directory has to exist first: corepack resolves
                            # it with realpathSync and fails with a bare ENOENT
                            # if it does not.
                            mkdir -p /tmp/bin
                            corepack enable --install-directory /tmp/bin
                            export PATH=/tmp/bin:$PATH
                            pnpm install
                            pnpm typecheck
                            pnpm test
                          '
                    '''
                }
            }
        }

        stage('Build and push') {
            steps {
                // Computed in Groovy, not in the shell. `${VAR:0:7}` is a bash
                // substring and Jenkins runs `sh`, which on Debian is dash: it
                // answers "Bad substitution" and nothing else.
                script {
                    env.SHORT_SHA = env.GIT_COMMIT.take(7)
                }
                withCredentials([usernamePassword(
                    credentialsId: 'ghcr',
                    usernameVariable: 'GHCR_USER',
                    passwordVariable: 'GHCR_PASS',
                )]) {
                    sh '''
                        set -eu
                        echo "$GHCR_PASS" | docker login "$REGISTRY" -u "$GHCR_USER" --password-stdin

                        docker buildx create --use --name builder 2>/dev/null || docker buildx use builder

                        # One Dockerfile, two targets. The tags exist so a human
                        # can find the build; the digests are what get deployed.
                        # --metadata-file is how each digest comes back without a
                        # second registry round trip.
                        #
                        # --secret, not --build-arg and not a COPY: the token is
                        # mounted for the length of one RUN and leaves no layer
                        # and no history entry behind.
                        docker buildx build \
                          --push \
                          --provenance=false \
                          --secret id=npmrc,src="$NPMRC" \
                          --tag "$IMAGE:$SHORT_SHA" \
                          --metadata-file metadata-api.json \
                          .

                        docker buildx build \
                          --push \
                          --provenance=false \
                          --target migrate \
                          --secret id=npmrc,src="$NPMRC" \
                          --tag "$MIGRATE_IMAGE:$SHORT_SHA" \
                          --metadata-file metadata-migrate.json \
                          .
                    '''
                }
                script {
                    env.IMAGE_DIGEST = readJSON(file: 'metadata-api.json')['containerimage.digest']
                    env.MIGRATE_DIGEST = readJSON(file: 'metadata-migrate.json')['containerimage.digest']
                    echo "Pushed ${env.IMAGE}@${env.IMAGE_DIGEST}"
                    echo "Pushed ${env.MIGRATE_IMAGE}@${env.MIGRATE_DIGEST}"
                }
            }
        }

        stage('Smoke test') {
            steps {
                // Start both images before committing their digests.
                //
                // This stage exists for one class of bug, and this repository is
                // full of it. The shared database package ships a Prisma schema
                // but no generated client, because Prisma 7 generates TypeScript
                // — so the image build has to generate and compile that client
                // itself. Several ways of getting that wrong produce a build
                // that succeeds and an image that cannot serve a request: a
                // client whose imports Node's ESM resolver rejects, a migrate
                // image that dies reaching for a package manager it cannot
                // download as an unprivileged uid, an entrypoint guard that
                // silently does not match and exits 0 having served nothing.
                //
                // The tests cannot see any of it: they run against the source,
                // not the image, and that class of failure only appears when the
                // image is started.
                //
                // Run with the same user and the same read-only filesystem the
                // Deployment applies, because "works as root" and "works as
                // 10001 with nothing writable" are different statements.
                //
                // By digest, not by tag: what is tested is exactly what will be
                // deployed.
                sh '''
                    set -eu
                    NET="smoke-$BUILD_NUMBER"
                    DB="smoke-db-$BUILD_NUMBER"
                    APP="smoke-app-$BUILD_NUMBER"

                    cleanup() {
                      docker logs "$APP" 2>&1 | tail -30 || true
                      docker rm -f "$APP" "$DB" >/dev/null 2>&1 || true
                      docker network rm "$NET" >/dev/null 2>&1 || true
                    }
                    trap cleanup EXIT

                    docker network create "$NET"
                    docker run -d --name "$DB" --network "$NET" \
                      -e POSTGRES_USER=twofree \
                      -e POSTGRES_PASSWORD=smoke \
                      -e POSTGRES_DB=twofree \
                      postgres:17-alpine

                    for i in $(seq 1 60); do
                      docker exec "$DB" pg_isready -U twofree -d twofree >/dev/null 2>&1 && break
                      sleep 1
                    done

                    DATABASE_URL="postgresql://twofree:smoke@$DB:5432/twofree"

                    # The migrate image first, and not piped into anything: a
                    # pipeline reports the exit status of its last command, so
                    # `docker run ... | tail` would swallow a failed migration
                    # and let the API start against an empty schema.
                    docker pull "${MIGRATE_IMAGE}@${MIGRATE_DIGEST}"
                    docker run --rm --network "$NET" \
                      -e DATABASE_URL="$DATABASE_URL" \
                      "${MIGRATE_IMAGE}@${MIGRATE_DIGEST}"

                    # Disposable values. The secret is long enough and unlike a
                    # placeholder because the configuration loader rejects both,
                    # and the encryption key is base64 of exactly 32 bytes
                    # because AES-256-GCM is.
                    docker pull "${IMAGE}@${IMAGE_DIGEST}"
                    docker run -d --name "$APP" --network "$NET" \
                      --user 10001:10001 --read-only --tmpfs /tmp \
                      -e DATABASE_URL="$DATABASE_URL" \
                      -e APP_PROFILE=cloud-test \
                      -e BETTER_AUTH_SECRET=smoke-test-only-value-not-used-anywhere-else \
                      -e BETTER_AUTH_URL=http://localhost:8080 \
                      -e DATA_ENCRYPTION_KEY=c21va2UtdGVzdC1rZXktbm90LWEtcmVhbC1zZWNyZXQ= \
                      "${IMAGE}@${IMAGE_DIGEST}"

                    # curl from a container on the same network: the agent needs
                    # neither curl nor a published port.
                    probe() {
                      docker run --rm --network "$NET" curlimages/curl:latest \
                        -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://$APP:8080$1"
                    }

                    # /health answers 503 while the database is unreachable, so a
                    # 200 here is the single assertion that proves the whole
                    # chain: the bundle starts, the compiled Prisma client loads,
                    # the pool connects, and the migrations really ran.
                    ok=""
                    for i in $(seq 1 45); do
                      if [ "$(probe /health || true)" = "200" ]; then ok=yes; break; fi
                      sleep 2
                    done
                    [ -n "$ok" ] || { echo "The image never answered 200 on /health."; exit 1; }

                    # /version is served by the same controller without touching
                    # the database, so it separates "the app is up" from "the
                    # database is up" when this stage fails.
                    [ "$(probe /version)" = "200" ] || { echo "/version did not answer 200."; exit 1; }

                    echo "Smoke test passed: both images start, the schema migrates, the API serves."
                '''
            }
        }

        stage('Scan') {
            steps {
                // After the push and before the GitOps commit, deliberately. An
                // image that fails here exists in the registry and is never
                // referenced by anything, which is harmless — whereas scanning
                // before the push would mean scanning an image built from a
                // different set of layers than the one that shipped.
                //
                // Both images, because the migrate image runs against the
                // production database with more privilege than the API has, and
                // it is the one that carries the Prisma CLI.
                //
                // --ignore-unfixed, because failing a build over a vulnerability
                // with no fix available teaches people to ignore the scanner.
                // The exceptions live in .trivyignore.yaml, each with a
                // reachability argument and a date it stops applying.
                withCredentials([usernamePassword(
                    credentialsId: 'ghcr',
                    usernameVariable: 'GHCR_USER',
                    passwordVariable: 'GHCR_PASS',
                )]) {
                    sh '''
                        set -eu
                        for target in "${IMAGE}@${IMAGE_DIGEST}" "${MIGRATE_IMAGE}@${MIGRATE_DIGEST}"; do
                          docker run --rm \
                            -e TRIVY_USERNAME="$GHCR_USER" \
                            -e TRIVY_PASSWORD="$GHCR_PASS" \
                            -v "$HOME/.cache/trivy:/root/.cache/" \
                            -v "$PWD/.trivyignore.yaml:/.trivyignore.yaml:ro" \
                            aquasec/trivy:latest image \
                              --scanners vuln \
                              --severity HIGH,CRITICAL \
                              --ignore-unfixed \
                              --ignorefile /.trivyignore.yaml \
                              --exit-code 1 \
                              "$target"
                        done
                    '''
                }
            }
        }

        stage('Update the desired state') {
            steps {
                sshagent(credentials: ['gitops-write']) {
                    sh '''
                        set -eu
                        rm -rf gitops
                        GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" \
                          git clone --depth 1 "$GITOPS" gitops

                        cd gitops
                        git config user.email "jenkins@camir.tech"
                        git config user.name  "jenkins"

                        # Matches the repository rather than the old value, so
                        # the scaffold's :PLACEHOLDER, a previous digest and a
                        # hand-edited manifest are all corrected rather than one
                        # of them being silently skipped.
                        #
                        # The API pattern ends at [@:] so it cannot also match
                        # twofree-api-migrate, whose name starts with it.
                        sed -i -E "s#image: ghcr\\.io/camircode/twofree-api[@:][^[:space:]]+#image: ${IMAGE}@${IMAGE_DIGEST}#" "$MANIFEST"
                        sed -i -E "s#image: ghcr\\.io/camircode/twofree-api-migrate[@:][^[:space:]]+#image: ${MIGRATE_IMAGE}@${MIGRATE_DIGEST}#" "$MIGRATE_MANIFEST"

                        if git diff --quiet; then
                          echo "Already at ${IMAGE_DIGEST}; nothing to commit."
                          exit 0
                        fi

                        # One commit for both files. The Job applies the schema
                        # the Deployment expects, so a revert that moved only one
                        # of them back would leave the two disagreeing.
                        git add "$MANIFEST" "$MIGRATE_MANIFEST"
                        git commit -m "deploy(twofree-api): ${IMAGE_DIGEST}

api     ${IMAGE}@${IMAGE_DIGEST}
migrate ${MIGRATE_IMAGE}@${MIGRATE_DIGEST}

Built from camircode/twofree-api@${GIT_COMMIT} by Jenkins build ${BUILD_NUMBER}."
                        GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" git push origin main
                    '''
                }
            }
        }
    }

    post {
        always {
            // The token file first: cleanWs() runs on the workspace, and a
            // failure earlier in this block must not be what leaves a readable
            // credential on the agent.
            sh 'rm -f "$NPMRC" || true'
            sh 'docker logout ghcr.io || true'
            cleanWs()
        }
    }
}
