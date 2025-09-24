# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY docs ./docs
RUN npm run build

FROM base AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY .env.example ./config/.env.example
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3333
CMD ["node", "dist/server.js"]
EXPOSE 3333

# Healthcheck para ambientes que suportam
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3333/health || exit 1
