# syntax=docker/dockerfile:1.7

# Keep Bun and the application dependency graph separate from source changes.
FROM oven/bun:1.3.14-slim AS dependencies

WORKDIR /app
COPY services/platform/package.json services/platform/bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14-slim AS runtime

ARG SOURCE_REVISION
LABEL org.opencontainers.image.title="holocron-platform" \
      org.opencontainers.image.description="Holocron Mastra platform runtime" \
      org.opencontainers.image.source="https://github.com/holocron/holocron" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      io.holocron.source-revision="${SOURCE_REVISION}"

ENV NODE_ENV=production \
    HOLO_SOURCE_REVISION=${SOURCE_REVISION}

WORKDIR /app
COPY --from=dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun services/platform/package.json ./package.json
COPY --chown=bun:bun services/platform/src ./src
COPY --chown=bun:bun services/platform/fleet/manifest.json ./fleet/manifest.json
COPY --chown=bun:bun .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml ./runtime-contracts/mcp-compatibility-manifest.yaml

# The upstream Bun image supplies the unprivileged `bun` user. Do not run a
# production server or worker as root.
USER bun

EXPOSE 4111

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:' + (process.env.PORT || '4111') + '/health'); if (!r.ok) process.exit(1)"

CMD ["bun", "src/index.ts"]
