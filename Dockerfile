# syntax=docker/dockerfile:1
# Imagem de produção do ERP (Next.js 14 standalone + Prisma 5).
# Multi-stage: deps -> builder -> runner (imagem final enxuta).

# ---- deps: instala dependências (com lockfile) ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: gera o Prisma Client e faz o build standalone ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runner: imagem final de produção ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# openssl é exigido pelos engines do Prisma; prisma CLI (global) roda o migrate deploy no start.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm i -g prisma@5.22.0 \
    && useradd -m -u 1001 erp
# Saída standalone do Next (server.js + node_modules mínimos)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Garante o engine do Prisma Client (o tracing do standalone às vezes não o inclui)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Schema + migrations para o `prisma migrate deploy` no start
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R erp:erp /app
USER erp
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
