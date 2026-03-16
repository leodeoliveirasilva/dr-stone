FROM node:24.14.0-slim AS build

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json tsconfig.base.json eslint.config.mjs vitest.config.ts ./
COPY dr-stone-api/package.json dr-stone-api/package.json
COPY dr-stone-database/package.json dr-stone-database/package.json
COPY dr-stone-scrapper/package.json dr-stone-scrapper/package.json

RUN pnpm install --frozen-lockfile

COPY dr-stone-api dr-stone-api
COPY dr-stone-database dr-stone-database
COPY dr-stone-scrapper dr-stone-scrapper

RUN find /app -name '*.tsbuildinfo' -delete
RUN pnpm build

FROM node:24.14.0-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY --from=build /app /app

CMD ["node", "dr-stone-api/dist/index.js"]
