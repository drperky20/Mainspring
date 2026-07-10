FROM node:22-bookworm-slim AS deps

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./

RUN --mount=type=cache,id=pnpm-store-mainspring,target=/pnpm/store \
  pnpm install --store-dir=/pnpm/store --frozen-lockfile

COPY src src
COPY scripts scripts

RUN pnpm run build \
  && pnpm prune --prod

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV MAINSPRING_RUNTIME_ROOT=/runtime
ENV MAINSPRING_SESSIONS_ROOT=/sessions
ENV MAINSPRING_WORKSPACE_ROOT=/workspaces/default
ENV MAINSPRING_POLL_INTERVAL_MS=1000

RUN groupadd --system --gid 10001 mainspring \
  && useradd --system --uid 10001 --gid mainspring --home-dir /app mainspring \
  && mkdir -p /runtime /workspaces /sessions /artifacts \
  && chown -R mainspring:mainspring /app /runtime /workspaces /sessions /artifacts

COPY --from=deps --chown=mainspring:mainspring /app/package.json /app/package.json
COPY --from=deps --chown=mainspring:mainspring /app/node_modules /app/node_modules
COPY --from=deps --chown=mainspring:mainspring /app/dist /app/dist

USER 10001:10001
VOLUME ["/runtime", "/workspaces", "/sessions", "/artifacts"]

CMD ["node", "dist/runner/main.js"]
