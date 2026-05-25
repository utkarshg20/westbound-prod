FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @westbound/worker... build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app /app
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
