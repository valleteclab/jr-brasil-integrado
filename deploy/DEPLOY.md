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
- Voz PT-BR padrão: `pf_dora` (Dora).
- Administradores podem trocar entre Dora, Alex e Santa, além de ouvir uma prévia, em
  **Configurações → IA do ERP → Voz do assistente**. A escolha é isolada por empresa e
  passa a valer nas próximas respostas de áudio, sem reiniciar os contêineres.
- Limites: 2 vCPU e 3 GiB de RAM; uma única réplica.
- Imagem fixada: `ghcr.io/remsky/kokoro-fastapi-cpu:v0.2.4`.
- O ERP usa esse endpoint para responder em voz quando a entrada do Telegram ou do WhatsApp/Z-API também foi por voz.
- A narração é limitada a 1.200 caracteres e tem timeout de 60 segundos; em caso de falha, a resposta é enviada em texto.
- Para remover somente o TTS: `docker stack rm kokoro`.

## Observações
- O Postgres do ERP é dedicado e isolado (rede `erp_internal`, sem porta publicada).
- O Railway atual é só de teste — a produção começa limpa neste Postgres.
- Recursos: a VPS tem 4 vCPU / 15Gi RAM com folga; o ERP + Postgres cabem tranquilo.

## 11. Faster-Whisper STT (áudio recebido no Telegram e WhatsApp)

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
- Áudio do Telegram ou WhatsApp/Z-API: no máximo 60 segundos e 6 MB.
- O texto transcrito entra no mesmo fluxo seguro do agente; respostas comuns voltam em voz, enquanto dados operacionais também permanecem em texto.
- No WhatsApp, a URL temporária da mídia precisa ser HTTPS pública, passa por bloqueio de rede privada e o arquivo não é persistido.
- Para remover somente o STT: `docker stack rm whisper`.

## WhatsApp comercial com Evolution

Entrega de 2026-09-06, exclusiva do comercial da plataforma. A Evolution API 2.3.7 do
CRM é reaproveitada como serviço; a instância `xerp-comercial-v1`, token e webhook são
exclusivos do XERP. O CRM continua com sua própria instância. A implementação usa
Evolution API (https://github.com/evolution-foundation/evolution-api), conexão Baileys
via WhatsApp Web, não a Cloud API oficial. Atribuição também aparece no painel.

1. Na VPS que hospeda CRM e ERP, executar `python3 deploy/provision-commercial-whatsapp.py`.
   O script cria apenas a instância dedicada e testa o isolamento de seu token contra
   outra instância. Não envia mensagens. Em conflito de instância/credencial, aborta.
2. Os segredos são criados em Docker secrets; o backup local fica em
   `/root/.config/xerp-commercial-whatsapp/credentials.json`, modo 0600, fora do Git.
   O ERP recebe somente o token da instância e o segredo do webhook, nunca a chave mestre.
3. Fazer build normal e implantar combinando `deploy/erp-stack.yml` com
   `deploy/commercial-whatsapp-stack.yml`. A rede compartilhada deve resolver
   `crm_evolution:8080`. Em atualização pontual via `docker service update`, preservar
   todos os campos existentes e acrescentar os dois secrets e variáveis do complemento.
4. Em `/admin/agente-comercial`, gerar QR Code e parear o telefone comercial. Configurar
   a chave OpenRouter, condições comerciais e contato humano, salvar e ativar o agente.
   Ativação exige conexão aberta e chave de IA. Prospecção ativa tem controle separado;
   não é habilitada pelo provisionamento ou pelo deploy.

Segurança: endpoints de conexão exigem administrador global; POST valida Origin; GET
não inicia pareamento. Credenciais são somente server-side. O webhook usa segredo em
header, exige instância dedicada e ignora mensagens próprias, grupos, broadcasts,
contatos sem número resolvido e eventos que não são mensagens novas. Áudio (até 60s/6MB)
é buscado pela Evolution autenticada e transcrito pelo Whisper. Respostas são em texto.

As interações persistem entrada, resposta e confirmação de envio. Um advisory lock por
contato serializa os eventos entre réplicas. Reentregas usam o ID composto do provedor;
falhas retornam HTTP 503 e, quando reentregues, reutilizam a resposta pendente. Há uma
janela inevitável de incerteza se o provedor aceitar o envio e a conexão cair antes da
confirmação local: não se promete exactly-once. Não há fila/worker de reprocessamento
próprio nesta etapa; a recuperação depende da reentrega do webhook. Histórico já entregue
não é reprocessado. QR Code expira no painel e pode ser gerado novamente.

Validação: `npx tsc --noEmit`, `npm run lint`, `npx tsx scripts/test-commercial-evolution.ts`,
`npx tsx scripts/test-commercial-delivery.ts` e build Docker. Testes simulam o transporte;
nenhuma mensagem real deve ser enviada sem destinatário e autorização definidos.
