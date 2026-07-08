FROM node:20-bookworm-slim AS deps

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./

RUN --mount=type=cache,id=pnpm-store-mainspring-gateway,target=/pnpm/store \
  pnpm install --store-dir=/pnpm/store --frozen-lockfile

COPY src src
COPY scripts scripts

RUN pnpm run build \
  && pnpm prune --prod

FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PATH=/app/node_modules/.bin:$PATH
ENV MAINSPRING_GATEWAY_HOST=0.0.0.0
ENV MAINSPRING_GATEWAY_PORT=8787
ENV MAINSPRING_SESSIONS_ROOT=/data/sessions
ENV MAINSPRING_WORKSPACE_ROOT=/data/workspaces
ENV MAINSPRING_GATEWAY_APP_DB=/data/gateway-app.sqlite
ENV MAINSPRING_RUNLOG_ROOT=/data/runlog
ENV MAINSPRING_RUNLOG_DB=/data/runlog/runlog.sqlite
ENV MAINSPRING_RUNLOG_WORKSPACE_ROOT=/data/runlog/workspaces
ENV MAINSPRING_GATEWAY_MANAGED_SECRET_KEY=/data/gateway-app.sqlite.managed-key
ENV MAINSPRING_GATEWAY_MANAGED_SECRET_STORE=file
ENV MAINSPRING_CONTAINERIZED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 10001 mainspring \
  && useradd --system --uid 10001 --gid mainspring --home-dir /app mainspring \
  && mkdir -p /data /codex-home \
  && chown -R mainspring:mainspring /app /data /codex-home

COPY --from=deps --chown=mainspring:mainspring /app/package.json /app/package.json
COPY --from=deps --chown=mainspring:mainspring /app/node_modules /app/node_modules
COPY --from=deps --chown=mainspring:mainspring /app/dist /app/dist
COPY --chown=root:root docker/gateway-entrypoint.sh /usr/local/bin/mainspring-gateway-entrypoint

RUN chmod +x /usr/local/bin/mainspring-gateway-entrypoint
VOLUME ["/data"]
EXPOSE 8787

ENTRYPOINT ["mainspring-gateway-entrypoint"]
CMD ["node", "dist/gateway/server/dev.js"]
