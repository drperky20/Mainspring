FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV VITE_MAINSPRING_GATEWAY_URL=http://127.0.0.1:8787

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/console apps/console

RUN --mount=type=cache,id=pnpm-store-mainspring-console,target=/pnpm/store \
  pnpm install --store-dir=/pnpm/store --frozen-lockfile

COPY src src

RUN pnpm run build \
  && pnpm --filter @mainspring/console build

EXPOSE 4173

CMD ["pnpm", "--filter", "@mainspring/console", "preview", "--host", "0.0.0.0"]
