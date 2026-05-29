# Handoff — Emissão Fiscal e Módulos Operacionais

Documento vivo de coordenação entre agentes para a entrega "produto pronto para uso do cliente",
com foco em deixar a plataforma **pronta para integrar API de emissão de NF-e, NFC-e e NFS-e**.

> Atualize este arquivo ao iniciar/concluir cada tarefa. Marque `[ ]` → `[~]` (em andamento) → `[x]` (concluído).

## Ambiente desta sessão

- PostgreSQL 16 local rodando em `localhost:5432` (banco `jr_brasil_integrado`, shadow `jr_brasil_shadow`).
- `.env` local criado (não versionado) com `DATABASE_URL`, `SHADOW_DATABASE_URL`, `AI_CONFIG_SECRET`.
- Migration `20260529123723_fiscal_emission_and_operational_modules` aplicada.
- Validação central: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Migration não-interativa: gerar SQL com `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` e aplicar com `prisma migrate deploy`.

## Convenções (obrigatório para todos os agentes)

- Páginas server: `export const dynamic = "force-dynamic"`, buscam via `src/lib/services/*`, tratam `loadError`.
- Regras de negócio em `src/domains/<modulo>/application/*` dentro de `prisma.$transaction`, sempre com `createAuditLog`.
- Toda query/escrita filtrada por `tenantId` + `empresaId` (`scopedByTenantCompany(scope)` / `getDevelopmentTenantScope()`).
- APIs em `src/app/api/erp/<modulo>/route.ts`, finas, status 400 para validação e 500 para erro inesperado.
- UI reusa `Button`, `StatusBadge`, `PageHeader`, `KpiCard`, `Card` e classes CSS existentes (`erp-table`, `alert`, `empty-st`, `card`, `metric`, `op-*`).
- Segredos sempre via `encryptSecret`/`decryptSecret`. Nunca logar token/credencial.
- PT-BR na interface; sem jargão técnico em tela.

## Infraestrutura compartilhada (dono: orquestrador) — CONCLUÍDA

- [x] Expansão do schema Prisma (fiscal, financeiro, estoque, inventário, compras, OS, vendas).
- [x] Migration aplicada + client regenerado.
- [x] Seed operacional ampliado (fornecedor, produtos com saldo, conta bancária, config fiscal, regras tributárias, depósito padrão).
- [x] CSS de módulos operacionais (`op-*`, `kpi-row`, `link-btn`, `alert.success/warn`) em `globals.css`.
- [x] Serviço de estoque (`src/domains/stock/application/stock-service.ts`): `applyStockMovement`, `reserveStock`, `releaseReservations`, `commitReservationsAsExit`, `exitStock`, `getDefaultDeposito`. Idempotência + custo médio.
- [x] Helpers compartilhados: `src/lib/numbering.ts` (`nextDocumentNumber`, `nextFiscalNumber`).
- [x] **Núcleo fiscal** (`src/domains/fiscal/*`): configuração, motor tributário (`tax-engine.ts`), builders (`document-builder.ts`), provider abstrato (`providers/*`: interno funcional + adapter HTTP), emissão/cancelamento/carta de correção (`application/*`).
- [x] APIs + UI fiscal (`/erp/fiscal`, `/erp/configuracoes/fiscal`, `/api/erp/fiscal/*`).
- [x] Smoke test validado: NF-e emitida AUTORIZADA com chave de 44 dígitos válida, tributos calculados e cancelamento OK.

### APIs disponíveis para os subagentes consumirem

- Emissão: `emitFiscalDocument(scope, document, links)` em `@/domains/fiscal/application/fiscal-emission-use-cases`.
  - `document` vem de `buildDocumentFromPedido(...)` ou `buildNfseFromOrdemServico(...)` em `@/domains/fiscal/document-builder`.
  - `links`: `{ clienteId?, pedidoVendaId?, ordemServicoId?, usuarioId? }`. Retorna a `NotaFiscal` com itens.
- Estoque: funções de `@/domains/stock/application/stock-service` recebem `(tx, scope, ...)` e rodam DENTRO de `prisma.$transaction`.
- Numeração: `nextDocumentNumber(prisma.<modelo>, scope, "PV")` para pedidos/OS/etc.

## Módulos (subagentes — dependem da infra acima estável)

### T1 — Vendas (`/erp/vendas`)
- [ ] Service + use-cases: criar pedido, itens, reservar estoque, confirmar (baixa + contas a receber), faturar (emitir NF-e), cancelar.
- [ ] APIs + UI lista/criação/detalhe. Botão "Emitir NF-e" chama núcleo fiscal.

### T2 — Estoque (`/erp/estoque`)
- [ ] Service de leitura (saldos, movimentos, alertas mínimo). UI: saldos, kardex, ajuste, transferência (consome stock-service).
- [ ] Inventário: abrir, contar, finalizar (gera ajustes).

### T3 — Financeiro (`/erp/financeiro`, `/erp/fluxo-caixa`)
- [ ] Contas a pagar/receber: lista, baixa (parcial/total, juros/multa/desconto), movimento financeiro + conta bancária.
- [ ] Fluxo de caixa: projeção e realizado.

### T4 — Compras + Fornecedores (`/erp/compras`, `/erp/fornecedores`)
- [ ] Fornecedores CRUD. Pedido de compra: criar, enviar, receber (gera entrada fiscal / atualiza recebido).

### T5 — Orçamentos + OS + Atendimento (`/erp/orcamentos`, `/erp/os`, `/erp/atendimento`)
- [ ] Orçamento: criar, precificar, aprovar, converter em pedido.
- [ ] OS: abrir, lançar serviços/peças, faturar (NFS-e serviços + baixa peças + contas a receber).
- [ ] Atendimento: hub que abre venda balcão / orçamento / OS.

### T6 — Clientes + Colaboradores (`/erp/clientes`, `/erp/colaboradores`)
- [ ] Clientes: CRUD completo (contatos, endereços, crédito, tabela de preço, aprovação).
- [ ] Colaboradores: usuários/vínculos/perfis (RBAC) leitura+gestão básica.

### T7 — Dashboard + Relatórios (`/erp`, `/erp/relatorios`)
- [ ] Dashboard com KPIs reais. Relatórios: vendas, estoque, financeiro, fiscal, DRE simplificado.

## Riscos / decisões

- Provider fiscal real (Focus NFe, NFe.io, PlugNotas, WebmaniaBR) exige token/certificado A1 do cliente — fora deste ambiente.
  Entregamos provider `MANUAL/INTERNO` totalmente funcional (gera chave/protocolo simulados em homologação) + adapter HTTP
  genérico pronto para receber credenciais reais. Trocar provider é configuração, não código.
- Não há dados reais de cliente neste ambiente; seed usa dados fictícios.
</content>
