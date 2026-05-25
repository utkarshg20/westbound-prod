FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install && pnpm --filter @westbound/dashboard build
WORKDIR /app/apps/dashboard
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
