# Handoff — Integração fiscal ACBr (branch claude/quirky-pasteur-6a38s)

## Estado atual (verificado ao vivo em homologação)
- **Provider ACBr** completo: NF-e, NFC-e, NFS-e (DPS nacional), OAuth2 com cache.
- **NF-e ponta a ponta pelo ERP**: AUTORIZADA (SEFAZ-BA). Validado tela a tela.
- **Pós-emissão pelo ERP** (todos verificados ao vivo):
  - Baixar PDF (DANFE) e XML: rotas `/api/erp/fiscal/[id]/pdf` e `/xml` (download server-side com Bearer).
  - Carta de correção: OK (sequência 1).
  - Cancelamento: OK → CANCELADA (corrigido parsing do evento ACBr: codigo_status 135/155).
  - Travas de prazo: NF-e 24h, NFC-e 30min, carta 30 dias. Bloqueio testado (backdate 48h → HTTP 400).
  - Tela de detalhe `/erp/fiscal/[id]` + componente `NotaFiscalActions`.
  - Atualizar status (sincronizar) cabeado na tela de detalhe.

## NÃO testado / pendências honestas
- **NFS-e nacional**: payload aceito, mas só autoriza com credencial de PRODUÇÃO da ACBr
  (Sandbox só alcança "produção restrita" do ADN). Não emitiu ao vivo ainda.
- **NFC-e**: implementada, sem teste ao vivo (precisa CSC configurado na ACBr).
- **Cenários fiscais**: testado venda simples Lucro Presumido, 1 item, sem ST/IPI/frete rateado.

## Para emitir no ambiente do cliente
1. `prisma migrate deploy` (enum ACBR).
2. Credenciais de PRODUÇÃO da ACBr → tela Config Fiscal, Ambiente=Produção.
3. Certificado A1 + empresa no cadastro ACBr de produção.
4. Regime tributário correto na config (define grupo ICMS/PIS/COFINS).
5. Conferir série/numeração.

## SEGURANÇA
- Recomendado ROTACIONAR o client_secret Sandbox (passou pelo chat). Nenhum segredo foi commitado.

## Ferramenta de teste E2E
- `scripts/erp-walkthrough.mjs` (Playwright). Ex.: `ACBR_CLIENT_ID=.. ACBR_CLIENT_SECRET=.. PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers ERP_BASE=http://localhost:3000 node scripts/erp-walkthrough.mjs emit-nfe`
- Passos: config-open, config-acbr, emit-open, emit-nfe.
- Dev server: `npm run dev` (porta 3000). Postgres: `pg_ctlcluster 16 main start`.

## Arquivos-chave
- `src/domains/fiscal/providers/acbr-provider.ts` — provider (emit/cancel/correct/download/queryStatus).
- `src/domains/fiscal/application/fiscal-emission-use-cases.ts` — cancel/correção/download + prazos.
- `src/lib/services/fiscal.ts` — listNotasFiscais + getNotaFiscalDetalhe.
- `src/app/erp/fiscal/[id]/page.tsx` + `src/components/erp/NotaFiscalActions.tsx` — detalhe + ações.
