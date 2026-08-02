# Holocron production Compose contract

`compose.yaml` is the v1 four-service production contract: `postgres`,
`mastra`, `scheduler`, and `zero-cache`. `compose.dev.yaml` only changes laptop
labels and durable volume names; it must never add a service or replace either
application image.

The application image is supplied as `HOLO_PLATFORM_IMAGE` and must be a full
registry reference ending in `@sha256:<64-hex>`. Both `mastra` and `scheduler`
use that same image. Do not use tags such as `latest` or a tag-only image.

Runtime credentials are Docker Compose environment-backed secrets. Before
starting Compose, an operator injects `POSTGRES_PASSWORD`, `DATABASE_URL`,
`MASTRA_API_KEY`, `FLEET_KEY`, and `ZERO_ADMIN_PASSWORD` from the approved
operator secret store. Compose mounts those values at `/run/secrets/*`; they
are not build arguments, Compose literals, or image files. `FLEET_URL` is an
endpoint setting, not a secret.

Use the example files only to render the shape of the contract:

```sh
docker compose -f services/platform/deploy/compose/compose.yaml \
  --env-file services/platform/deploy/compose/production.env.example config --quiet
docker compose -f services/platform/deploy/compose/compose.yaml \
  -f services/platform/deploy/compose/compose.dev.yaml \
  --env-file services/platform/deploy/compose/development.env.example config --quiet
```

`image-lock.json` is a checked-in schema example, not a deploy authorization.
It is explicitly marked `deployable: false` and intentionally contains a
rejected `registry.example`/synthetic identity. It is non-landing metadata
until a real package run replaces it with Docker-observed release evidence.
Immediately before deployment, source the runtime secret source, set
`HOLO_PLATFORM_IMAGE` to the pushed candidate, then build and package it:

The candidate must be built from the clean commit with its exact source revision
in OCI metadata. The release build is root-context only, so use:

```sh
SOURCE_REVISION="$(git rev-parse HEAD)"
docker build --file services/platform/Dockerfile \
  --build-arg SOURCE_REVISION="$SOURCE_REVISION" \
  --tag "holocron-platform:$SOURCE_REVISION" .
holo deploy:package --image "$HOLO_PLATFORM_IMAGE" --previous-image "$HOLO_PREVIOUS_PLATFORM_IMAGE"
```

The command refuses a dirty revision, a placeholder or non-digest image, a
missing prior rollback digest, a remote manifest mismatch, a local RepoDigest
mismatch, an OCI revision different from the clean Git SHA, or a broken rendered
Compose contract. It writes the deployable lock only after all checks pass.

To select the already-locked prior image without changing containers or volumes:

```sh
holo deploy:rollback-preflight --lock services/platform/deploy/compose/image-lock.json
```

That command only validates Docker manifest/config identity and rendered Compose;
it never runs `docker compose up`, `docker compose down`, or any volume command.
D06-07 consumes the resulting lock. This task never performs a cutover action
or deletes a durable volume.
