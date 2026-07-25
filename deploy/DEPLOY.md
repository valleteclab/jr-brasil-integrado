# Deploy do ERP na VPS (Docker Swarm + Traefik)

A VPS já roda **Docker Swarm + Traefik v3** (proxy 80/443, TLS Let's Encrypt automático,
rede overlay `LomeServer`) com Chatwoot, Portainer e cidadaoai. O ERP entra como **mais uma
stack**, com banco **Postgres dedicado** e domínio **`erp.sisgov.app.br`**.

> Tudo isolado: o ERP NÃO compartilha banco com o Chatwoot. O Postgres do ERP fica só na rede
> interna `erp_internal` (não exposto na internet).

## 1. DNS
Crie um registro **A**: `erp.sisgov.app.br` → **212.85.0.166**. O Traefik emite o certificado
TLS sozinho no primeiro acesso (desafio HTTP). Aguarde o DNS propagar antes de subir.

## 2. Clonar o repositório na VPS
```bash
mkdir -p /root/projetos && cd /root/projetos
git clone https://github.com/valleteclab/jr-brasil-integrado.git jrb-erp
cd jrb-erp
```
> Se o repo for **privado**, use um token: `git clone https://<TOKEN>@github.com/valleteclab/jr-brasil-integrado.git jrb-erp`.

## 3. Variáveis de ambiente
```bash
cp deploy/erp.env.example erp.env
nano erp.env          # preencha os valores
chmod 600 erp.env
```
Gere os segredos fortes:
```bash
openssl rand -base64 24   # ERP_DB_PASSWORD
openssl rand -hex 32      # AI_CONFIG_SECRET
```

## 4. Build da imagem
```bash
docker build -t jrb-erp:latest .
```

## 5. Subir a stack
```bash
set -a; . ./erp.env; set +a
docker stack deploy -c deploy/erp-stack.yml erp
```
Acompanhe:
```bash
docker service ls | grep erp
docker service logs -f erp_erp        # deve mostrar "migrate deploy" e depois o Next.js subindo
```
As migrations rodam automaticamente no start (entrypoint → `prisma migrate deploy`).

## 6. Conferir
- `https://erp.sisgov.app.br` deve responder (cert válido em ~1 min após o 1º acesso).
- Logs sem erro de banco; `docker service ps erp_erp` com 1 réplica `Running`.

## 7. Seed inicial (dono da plataforma + 1ª empresa)
O runner é enxuto (sem tsx). Rode tarefas one-off com a imagem de build (`--target builder`),
na mesma rede do banco:
```bash
docker build --target builder -t jrb-erp:tools .
set -a; . ./erp.env; set +a
docker run --rm --network erp_internal \
  -e DATABASE_URL="postgresql://erp:${ERP_DB_PASSWORD}@erp_postgres:5432/erp?schema=public" \
  -e PLATFORM_OWNER_EMAIL="${PLATFORM_OWNER_EMAIL}" \
  jrb-erp:tools npm run admin-plataforma     # concede admin da plataforma
# (e/ou)  ... jrb-erp:tools npx prisma db seed
```
> Ajustar conforme o que cada script espera (ver `scripts/conceder-admin-plataforma.ts` e
> `prisma/seed.ts`). Posso guiar/automatizar isso na hora do deploy.

## 8. Atualizações (deploy de nova versão)
```bash
cd /root/projetos/jrb-erp
git pull
docker build -t jrb-erp:latest .
docker service update --image jrb-erp:latest --force erp_erp
```

## 9. Rollback / manutenção
- Logs: `docker service logs erp_erp` · `docker service logs erp_erp_postgres`
- Remover a stack (preserva o volume do banco): `docker stack rm erp`
- Backup do banco: `docker exec $(docker ps -qf name=erp_erp_postgres) pg_dump -U erp erp > backup.sql`

## 10. Kokoro TTS (voz do assistente)

O Kokoro roda em uma stack separada, CPU-only, conectado apenas à rede privada do ERP.
Não há porta publicada na internet.

```bash
docker stack deploy -c deploy/kokoro-stack.yml kokoro
docker service ps kokoro_api
docker service logs -f kokoro_api
```

- Endpoint interno: `http://kokoro_api:8880/v1/audio/speech`
- Voz PT-BR inicial: `pf_dora`
- Limites: 2 vCPU e 3 GiB de RAM; uma única réplica.
- Imagem fixada: `ghcr.io/remsky/kokoro-fastapi-cpu:v0.2.4`.
- O ERP usa esse endpoint para responder em voz quando a entrada do Telegram também foi por voz.
- A narração é limitada a 1.200 caracteres e tem timeout de 60 segundos; em caso de falha, a resposta é enviada em texto.
- Para remover somente o TTS: `docker stack rm kokoro`.

## Observações
- O Postgres do ERP é dedicado e isolado (rede `erp_internal`, sem porta publicada).
- O Railway atual é só de teste — a produção começa limpa neste Postgres.
- Recursos: a VPS tem 4 vCPU / 15Gi RAM com folga; o ERP + Postgres cabem tranquilo.

## 11. Faster-Whisper STT (áudio recebido no Telegram)

O Whisper roda em uma stack separada, CPU-only, conectado apenas à rede privada do ERP.
Não há porta publicada na internet.

```bash
docker stack deploy -c deploy/whisper-stack.yml whisper
docker service ps whisper_api
docker service logs -f whisper_api
```

- Endpoint interno: `http://whisper_api:9000/asr`
- Motor/modelo: `faster_whisper` / `base`, em CPU.
- Limites: 1,5 vCPU e 3 GiB de RAM; uma única réplica.
- Áudio do Telegram: no máximo 60 segundos e 6 MB.
- O texto transcrito entra no mesmo fluxo seguro do agente; respostas comuns voltam em voz, enquanto dados operacionais também permanecem em texto.
- Para remover somente o STT: `docker stack rm whisper`.
