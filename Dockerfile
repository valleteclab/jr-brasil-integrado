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
# TZ: fuso de Brasília para TODA formatação server-side de data/hora (telas, cupons, crons).
# O armazenamento no banco segue em UTC (Prisma) — isto muda só a exibição/parse local.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    TZ=America/Sao_Paulo
# openssl é exigido pelos engines do Prisma; tzdata dá o fuso; prisma CLI roda o migrate no start.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
    && ln -snf /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime \
    && echo "America/Sao_Paulo" > /etc/timezone \
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
