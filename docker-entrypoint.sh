#!/bin/sh
# Entrypoint do ERP em produção: aplica as migrations e sobe o Next.js (standalone).
set -e

echo "[entrypoint] Aplicando migrations (prisma migrate deploy)..."
prisma migrate deploy

echo "[entrypoint] Iniciando o servidor Next.js na porta ${PORT:-3000}..."
exec node server.js
