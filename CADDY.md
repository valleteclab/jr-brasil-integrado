# CADDY — Notas de execução do app (jr-brasil-integrado)

Projeto **Next.js** (App Router) + Prisma/PostgreSQL.

## Como rodar
- Banco: PostgreSQL local. Iniciar cluster se necessário:
  `pg_ctlcluster 16 main start` (verificar com `pg_isready`).
- Variáveis: `.env` (DATABASE_URL etc). `npm run predev` roda `scripts/ensure-env.js`.
- Dev server: `npm run dev` (Next, porta padrão 3000).
- Seed: `npm run dev:seed` (tsx prisma/seed.ts).
- Prisma client: `npx prisma generate` após mudar schema.
- Migrations já aplicadas: enum ProvedorFiscal inclui `ACBR`.

## Autenticação em dev
- Sessão de dev via `src/lib/auth/dev-session.ts` (TenantScope). Verificar como o tenant/empresa
  são resolvidos para acessar o ERP sem login real.

## Fiscal / ACBr
- Provider: `src/domains/fiscal/providers/acbr-provider.ts` (OAuth2, NF-e/NFC-e/NFS-e DPS).
- Config na tela: Configurações › Fiscal (`src/components/erp/FiscalSettingsForm.tsx`).
  ACBr: Client ID → cscId, Client Secret → token (criptografado), baseUrl derivada do ambiente.
- NF-e validada ao vivo (SEFAZ-BA homologação, status 100). NFS-e nacional requer credencial
  de Produção (Sandbox só alcança produção restrita do ADN).

## Gotchas
- Saída do shell estava sendo poluída por aviso de CADDY.md vazio — resolvido ao preencher.
