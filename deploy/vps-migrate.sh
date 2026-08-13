#!/usr/bin/env bash
# Migração TOTAL da VPS (ERP + Chatwoot + cidadaoai/tecnico + kokoro/whisper + traefik/portainer).
# Roda da MÁQUINA LOCAL, orquestrando origem (erp-vps) e destino (NEW_HOST) via SSH.
#
# Uso:
#   NEW_HOST=root@IP.NO.VO.AQUI ./deploy/vps-migrate.sh setup     # 1. docker+swarm+rede na nova
#   NEW_HOST=... ./deploy/vps-migrate.sh sync                     # 2. projetos, stacks, volumes, imagens
#   NEW_HOST=... ./deploy/vps-migrate.sh dbs                      # 3. dump+restore dos Postgres (pré-virada)
#   NEW_HOST=... ./deploy/vps-migrate.sh up                       # 4. sobe as stacks na nova
#   NEW_HOST=... ./deploy/vps-migrate.sh cutover                  # 5. NA VIRADA: pausa crons, delta dos DBs,
#                                                                 #    sobe tudo, instala crontab — então troca o DNS
#
# Domínios (trocar A record na virada): erp.sisgov.app.br, chat.sisgov.app.br, tecnico.sisgov.app.br
# Rede overlay: LomeServer. Stacks em /root/projetos + ymls das stacks.
set -euo pipefail

OLD="erp-vps"
NEW="${NEW_HOST:?Defina NEW_HOST=root@ip-da-nova}"
FASE="${1:?Fase: setup | sync | dbs | up | cutover}"

sshn() { ssh -o StrictHostKeyChecking=accept-new "$NEW" "$@"; }
ssho() { ssh "$OLD" "$@"; }

pg_dump_restore() { # $1 = nome do container origem (filtro), $2 = db, $3 = user, $4 = service destino
  echo ">> dump+restore $2..."
  ssho "docker exec \$(docker ps -qf name=$1 | head -1) pg_dump -U $3 -d $2 --clean --if-exists" \
    | sshn "docker exec -i \$(docker ps -qf name=$4 | head -1) psql -U $3 -d $2"
}

case "$FASE" in
  setup)
    sshn 'command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh'
    sshn 'docker info --format "{{.Swarm.LocalNodeState}}" | grep -q active || docker swarm init'
    sshn 'docker network inspect LomeServer >/dev/null 2>&1 || docker network create --driver overlay --attachable LomeServer'
    sshn 'apt-get update -qq && apt-get install -y -qq rsync unzip >/dev/null'
    echo "OK setup"
    ;;
  sync)
    # Projetos (código+envs+ymls) e utilitários — rsync via pipe local (chaves distintas)
    ssho 'tar czf - /root/projetos /root/*.yaml /root/*.sh /root/*.py /root/cidadaoai /root/cidadaoai-env /root/dados_vps /root/backups 2>/dev/null || true' | sshn 'tar xzf - -C /'
    # Volumes de ARQUIVOS (não-DB): chatwoot storage/public/mailers, portainer, kokoro/whisper cache
    for vol in chatwoot_storage chatwoot_public chatwoot_mailer chatwoot_mailers portainer_data cidadaoai_cidadaoai_media whisper_whisper_cache; do
      echo ">> volume $vol..."
      sshn "docker volume create $vol >/dev/null"
      ssho "docker run --rm -v $vol:/v alpine tar czf - -C /v ." | sshn "docker run --rm -i -v $vol:/v alpine tar xzf - -C /v"
    done
    echo "OK sync (volumes de DB vão na fase dbs)"
    ;;
  dbs)
    # Sobe SÓ os bancos na nova antes (postgres do ERP, pgvector do Chatwoot, pg do cidadaoai)
    sshn 'cd /root/projetos/jrb-erp && docker stack deploy -c deploy/erp-stack.yml erp 2>/dev/null || true'
    echo "(aguarde os Postgres ficarem healthy na nova antes de rodar de novo se falhar)"
    sleep 20
    pg_dump_restore erp_erp_postgres erp erp erp_erp_postgres
    echo "OK dbs (pgvector/cidadaoai: rodar cutover que refaz o delta de todos)"
    ;;
  up)
    sshn 'cd /root && for f in traefik.yaml portainer.yaml pgvector.yaml chatwoot.yaml; do [ -f "$f" ] && n=$(basename "$f" .yaml) && docker stack deploy -c "$f" "$n"; done; cd /root/projetos/jrb-erp && docker stack deploy -c deploy/kokoro-stack.yml kokoro && docker stack deploy -c deploy/whisper-stack.yml whisper; true'
    sshn 'cd /root/projetos/jrb-erp && docker stack deploy -c deploy/erp-stack.yml erp'
    echo "OK stacks na nova — confira: ssh $NEW docker service ls"
    ;;
  cutover)
    echo ">> pausando crons na origem..."
    ssho 'crontab -l > /root/crontab.bak; crontab -r || true'
    echo ">> delta final dos bancos..."
    pg_dump_restore erp_erp_postgres erp erp erp_erp_postgres
    pg_dump_restore pgvector_pgvector chatwoot postgres pgvector_pgvector || echo "(pgvector: confira user/db)"
    echo ">> instalando crontab na nova..."
    ssho 'cat /root/crontab.bak' | sshn 'crontab -'
    echo ""
    echo "AGORA: troque os A records (erp/chat/tecnico.sisgov.app.br) para o IP da nova."
    echo "O Traefik emite os certificados sozinho no primeiro acesso. Smoke test: login + emissão HOM."
    ;;
  *) echo "Fase desconhecida: $FASE" && exit 1 ;;
esac
