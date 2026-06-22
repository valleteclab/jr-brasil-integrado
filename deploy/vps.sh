#!/usr/bin/env bash
# Conexao com a VPS de producao do ERP (Docker Swarm + Traefik).
# A VPS hospeda 2 sistemas: o nosso ERP (stack "erp") e o Chatwoot (stack "chatwoot").
# Acesso por chave SSH (~/.ssh/id_ed25519). Atalho "erp-vps" tambem definido em ~/.ssh/config.
#
# Uso:
#   ./deploy/vps.sh                 # abre um shell interativo na VPS
#   ./deploy/vps.sh "comando..."    # roda um comando remoto e sai
#   ./deploy/vps.sh logs            # segue os logs do ERP (erp_erp)
#   ./deploy/vps.sh logs-pg         # segue os logs do Postgres do ERP
#   ./deploy/vps.sh ps              # lista os servicos do Swarm
#   ./deploy/vps.sh deploy          # git pull + build + update do servico erp_erp
set -euo pipefail

HOST="erp-vps"          # definido em ~/.ssh/config (212.85.0.166, user root)
APP_DIR="/root/projetos/jrb-erp"

case "${1:-}" in
  "")        exec ssh -t "$HOST" ;;
  logs)      exec ssh -t "$HOST" "docker service logs -f --tail 100 erp_erp" ;;
  logs-pg)   exec ssh -t "$HOST" "docker service logs -f --tail 100 erp_erp_postgres" ;;
  ps)        exec ssh "$HOST" "docker service ls" ;;
  deploy)
    exec ssh -t "$HOST" "cd $APP_DIR && git pull && docker build -t jrb-erp:latest . && docker service update --image jrb-erp:latest --force erp_erp"
    ;;
  *)         exec ssh "$HOST" "$@" ;;
esac
