# syntax=docker/dockerfile:1.7

# Keep Bun and the application dependency graph separate from source changes.
FROM oven/bun:1.3.14-slim AS dependencies

WORKDIR /app
COPY services/platform/package.json services/platform/bun.lock ./
RUN bun install --frozen-lockfile --production

# Pinned Compose-native backup binaries (immutable digests; no :latest).
FROM woblerr/pgbackrest@sha256:3e6c90cc4287efad0c16d667992aee9c70226bcb6ef3052f69a0c84121454bce AS backup-pgbackrest
FROM restic/restic@sha256:740ef3a20c7fe5de05ee031717a610ac8c3d1cf09a06cf77ffd4c3ec26e2302e AS backup-restic
FROM ghcr.io/anomalyco/opencode:1.18.17 AS opencode

FROM oven/bun:1.3.14-slim AS runtime

ARG SOURCE_REVISION
LABEL org.opencontainers.image.title="holocron-platform" \
      org.opencontainers.image.description="Holocron Mastra platform runtime" \
      org.opencontainers.image.source="https://github.com/holocron/holocron" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      io.holocron.source-revision="${SOURCE_REVISION}" \
      io.holocron.backup.pgbackrest-image="woblerr/pgbackrest@sha256:3e6c90cc4287efad0c16d667992aee9c70226bcb6ef3052f69a0c84121454bce" \
      io.holocron.backup.restic-image="restic/restic@sha256:740ef3a20c7fe5de05ee031717a610ac8c3d1cf09a06cf77ffd4c3ec26e2302e"

ENV NODE_ENV=production \
    HOLO_SOURCE_REVISION=${SOURCE_REVISION}

WORKDIR /app
COPY --from=dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun services/platform/package.json ./package.json
COPY --chown=bun:bun services/platform/src ./src
COPY --chown=bun:bun services/platform/fleet/manifest.json ./fleet/manifest.json
COPY --chown=bun:bun .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml ./runtime-contracts/mcp-compatibility-manifest.yaml
COPY --chown=bun:bun services/platform/deploy/compose/pgbackrest.conf /etc/pgbackrest/pgbackrest.conf

USER root
COPY --from=backup-restic /usr/bin/restic /usr/local/bin/restic
COPY --from=backup-pgbackrest /usr/bin/pgbackrest /usr/local/bin/pgbackrest
COPY --from=opencode /usr/local/bin/opencode /usr/local/bin/opencode
# OpenCode's published image is Alpine/musl. Copy the loader + C++ runtime so the
# binary can exec on oven/bun (Debian glibc) instead of dying with ENOENT.
COPY --from=opencode /lib/ld-musl-aarch64.so.1 /lib/ld-musl-aarch64.so.1
COPY --from=opencode /usr/lib/libgcc_s.so.1 /usr/lib/libgcc_s.so.1
COPY --from=opencode /usr/lib/libstdc++.so.6.0.34 /usr/lib/libstdc++.so.6.0.34
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    libbz2-1.0 \
    liblz4-1 \
    libpq5 \
    libssh2-1 \
    libssl3 \
    libxml2 \
    libzstd1 \
    zlib1g \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /lib/ld-musl-aarch64.so.1 /lib/libc.musl-aarch64.so.1 \
  && ln -sf /usr/lib/libstdc++.so.6.0.34 /usr/lib/libstdc++.so.6 \
  && chmod 0755 /usr/local/bin/restic /usr/local/bin/pgbackrest /usr/local/bin/opencode \
  && mkdir -p /home/bun/.config/opencode \
  && chown -R bun:bun /home/bun/.config \
  && /usr/local/bin/restic version \
  && /usr/local/bin/pgbackrest version \
  && /usr/local/bin/opencode --version
COPY --chown=bun:bun services/platform/deploy/docker/opencode.json /home/bun/.config/opencode/opencode.json

# The upstream Bun image supplies the unprivileged `bun` user. Do not run a
# production server or worker as root.
USER bun

EXPOSE 4111

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:' + (process.env.PORT || '4111') + '/health'); if (!r.ok) process.exit(1)"

CMD ["bun", "src/index.ts"]
