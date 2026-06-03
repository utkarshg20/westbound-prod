FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @westbound/worker... build

FROM base AS runner
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/platform/package.json ./packages/platform/
COPY packages/adapters/package.json ./packages/adapters/
COPY packages/agents/package.json ./packages/agents/
COPY packages/studio/package.json ./packages/studio/
COPY packages/sync-engine/package.json ./packages/sync-engine/
COPY packages/dsp/package.json ./packages/dsp/
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/packages/platform/dist ./packages/platform/dist
COPY --from=builder /app/packages/adapters/dist ./packages/adapters/dist
COPY --from=builder /app/packages/agents/dist ./packages/agents/dist
COPY --from=builder /app/packages/studio/dist ./packages/studio/dist
COPY --from=builder /app/packages/sync-engine/dist ./packages/sync-engine/dist
COPY --from=builder /app/packages/dsp/dist ./packages/dsp/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
USER node
WORKDIR /app/apps/worker
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/index.js"]
