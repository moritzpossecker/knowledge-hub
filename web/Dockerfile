# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps

WORKDIR /repo

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY web/package.json web/package.json
COPY packages/core/package.json packages/core/package.json

RUN npm ci


FROM node:22-bookworm-slim AS builder

WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY . .

RUN npm run core:build
RUN npm run web:build


FROM node:22-bookworm-slim AS runner

WORKDIR /repo

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /repo/web/.next/standalone ./
COPY --from=builder /repo/web/.next/static ./web/.next/static
COPY --from=builder /repo/web/public ./web/public

EXPOSE 3000

CMD ["node", "web/server.js"]
