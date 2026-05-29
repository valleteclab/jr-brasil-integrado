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
- [x] Service + use-cases: criar pedido, itens, reservar estoque, confirmar (baixa + contas a receber), faturar (emitir NF-e), cancelar.
- [x] APIs + UI lista/criação/detalhe. Botão "Emitir NF-e" chama núcleo fiscal.

### T2 — Estoque (`/erp/estoque`)
- [x] Service de leitura (saldos, movimentos, alertas mínimo). UI: saldos, kardex, ajuste, transferência (consome stock-service).
- [x] Inventário: abrir, contar, finalizar (gera ajustes).

### T3 — Financeiro (`/erp/financeiro`, `/erp/fluxo-caixa`)
- [x] Contas a pagar/receber: lista, baixa (parcial/total, juros/multa/desconto), movimento financeiro + conta bancária.
- [x] Fluxo de caixa: projeção e realizado.

### T4 — Compras + Fornecedores (`/erp/compras`, `/erp/fornecedores`)
- [x] Fornecedores CRUD. Pedido de compra: criar, enviar, receber (gera entrada fiscal / atualiza recebido).

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

---

## Referência técnica para subagentes (NÃO altere arquivos compartilhados)

Proibido alterar: `prisma/schema.prisma`, `src/app/globals.css`, `src/components/erp/ErpShell.tsx`,
`package.json`, `prisma/seed.ts`. Proibido rodar `prisma migrate/generate`, `npm run build`, `npm run dev`.
O orquestrador valida tudo centralmente. Cada módulo cria apenas seus próprios arquivos.

### Assinaturas compartilhadas

Estoque — `@/domains/stock/application/stock-service` (todas recebem `(tx, scope, ...)` dentro de `prisma.$transaction`):
- `getDefaultDeposito(tx, scope) => Deposito`
- `applyStockMovement(tx, scope, { produtoId, depositoId, tipo, quantidade /*>0*/, custoUnitario?, documentoTipo?, documentoId?, idempotencyKey?, origem?, origemId?, usuarioId?, observacoes? })` — `tipo`: `ENTRADA|SAIDA|TRANSFERENCIA|AJUSTE|ESTORNO`.
- `reserveStock(tx, scope, { produtoId, depositoId, quantidade, origemTipo, origemId, expiraEm? })`
- `releaseReservations(tx, scope, origemTipo, origemId)`
- `commitReservationsAsExit(tx, scope, origemTipo, origemId, { documentoTipo, documentoId, observacoes?, usuarioId? })`
- `exitStock(tx, scope, items: {produtoId, depositoId, quantidade, custoUnitario?}[], { documentoTipo, documentoId, observacoes?, usuarioId? })`

Fiscal — emissão:
- `import { emitFiscalDocument } from "@/domains/fiscal/application/fiscal-emission-use-cases"`
- `import { buildDocumentFromPedido, buildNfseFromOrdemServico } from "@/domains/fiscal/document-builder"`
- `emitFiscalDocument(scope, document, { clienteId?, pedidoVendaId?, ordemServicoId?, usuarioId? })` → retorna `NotaFiscal` (cheque `nota.status === "AUTORIZADA"`; senão use `nota.motivo`).
- `buildDocumentFromPedido({ cliente, formaPagamento?, condicaoPagamento?, observacoes?, frete?, desconto?, modelo?: "NFE"|"NFCE", itens: { produto: {id, sku, nome, ncm, cest, cfop, origem, unidade, fiscal?}, quantidade, precoUnitario, desconto? }[] })`. `cliente`: `{ razaoSocial, documento, inscricaoEstadual, enderecos: {uf, padrao}[], contatos: {email, principal}[] }`.
- `buildNfseFromOrdemServico({ cliente, observacoes?, formaPagamento?, condicaoPagamento?, servicos: {descricao, valor, itemListaServico?}[] })`.

Numeração — `@/lib/numbering`:
- `nextDocumentNumber(prisma.pedidoVenda /*delegate*/, scope, "PV")` → `"PV-000001"`. Use o delegate do próprio modelo. Pode usar `tx.<modelo>` dentro de transação.

Auditoria — `createAuditLog(tx, { scope, entidade, entidadeId, acao, payload? })`.

### Campos de schema relevantes (nomes exatos)

- `PedidoVenda`: numero, clienteId, depositoId?, canal, status(`StatusPedido`: RASCUNHO|AGUARDANDO_PAGAMENTO|AGUARDANDO_NOTA|SEPARACAO|ENVIADO|ENTREGUE|CANCELADO), naturezaOperacao?, vendedor?, subtotal, desconto, frete, total, condicaoPagamento?, formaPagamento?, observacoes?, observacoesInternas?, confirmadoEm?, faturadoEm?, canceladoEm?, origemOrcamentoId?. Item: pedidoVendaId, produtoId, quantidade(Int), precoUnitario, custoUnitario, desconto, total.
- `ContaReceber`: clienteId, pedidoVendaId?, ordemServicoId?, notaFiscalId?, descricao, numeroDocumento?, origem?, formaPagamento?, vencimento, valor, valorPago, juros, multa, descontoBaixa, observacoes?, contaBancariaId?, status(`StatusFinanceiro`: ABERTO|PARCIAL|VENCIDO|PAGO|CANCELADO), pagoEm?.
- `ContaPagar`: fornecedorId?, pedidoCompraId?, entradaFiscalId?, descricao, numeroDocumento?, formaPagamento?, origem?, vencimento, valor, valorPago, juros, multa, descontoBaixa, observacoes?, contaBancariaId?, status, pagoEm?.
- `ContaBancaria`: nome, banco?, agencia?, conta?, tipo, saldoInicial, saldoAtual, ativo. `MovimentoFinanceiro`: contaBancariaId?, contaPagarId?, contaReceberId?, tipo(`TipoMovimentoFinanceiro`: CREDITO|DEBITO), origem, descricao, valor, formaPagamento?, saldoAnterior?, saldoPosterior?, dataMovimento, usuarioId?.
- `Fornecedor`: razaoSocial, nomeFantasia?, documento, email?, telefone?, cidade?, uf?, condicaoPagamento?, ativo. Unique: [tenantId, empresaId, documento].
- `PedidoCompra`: numero, fornecedorId, depositoId?, status(`StatusPedidoCompra`: RASCUNHO|ENVIADO|PARCIAL|RECEBIDO|CANCELADO), condicaoPagamento?, observacoes?, previsaoEm?, subtotal, frete, total. Item: produtoId, quantidade(Int), quantidadeRecebida(Decimal), custoUnitario, total.
- `Orcamento`: numero, clienteId, canal, status(`StatusOrcamento`: RASCUNHO|EM_ANALISE|AGUARDANDO_CLIENTE|APROVADO|EXPIRADO|REJEITADO|CONVERTIDO), validoAte?, observacaoVendedor?, vendedor?, condicaoPagamento?, formaPagamento?, desconto, subtotal, total, pedidoGeradoId?, aprovadoEm?. Item: produtoId, quantidade(Int), precoUnitario, total.
- `OrdemServico`: numero, clienteId, status(`StatusOrdemServico`: ABERTA|EM_ANDAMENTO|AGUARDANDO_PECAS|FINALIZADA_NAO_FATURADA|FATURADA|CANCELADA), equipamento, placaOuSerial?, diagnostico?, problemaRelatado?, depositoId?, previsaoEm?, totalServicos, totalPecas, desconto, total, condicaoPagamento?, formaPagamento?, observacoes?, faturadoEm?. MaoObra: descricao, horas, valorHora, total. Peca: produtoId, quantidade(Int), precoUnitario, total.
- `Inventario`: depositoId, numero, descricao?, status(`StatusInventario`: ABERTO|EM_CONTAGEM|FINALIZADO|CANCELADO), iniciadoEm?, finalizadoEm?, observacoes?. Item: produtoId, saldoSistema, saldoContado?, custoUnitario, contado, ajustado. Unique item: [tenantId, empresaId, inventarioId, produtoId].
- `EstoqueSaldo` unique: [tenantId, empresaId, produtoId, depositoId, controleKey] (controleKey="SEM_CONTROLE"); campos quantidade, reservado, minimo, maximo.
- `Cliente`: razaoSocial, nomeFantasia?, documento, inscricaoEstadual?, status(`StatusCliente`: PENDENTE_APROVACAO|ATIVO|BLOQUEADO|INATIVO), segmento?, limiteCredito, creditoUsado, condicaoPagamento?, tabelaPrecoId?. Relations: contatos(ClienteContato: nome,email?,telefone?,whatsapp?,cargo?,principal), enderecos(ClienteEndereco: apelido,cep,logradouro,numero?,complemento?,bairro?,cidade,uf,padrao). Unique: [tenantId, documento].

### Notas de completude de cada subagente (preencher ao terminar)

### T4 Compras/Fornecedores — concluído

**Arquivos criados:**
- `src/domains/purchasing/application/supplier-use-cases.ts` — `createSupplier`, `updateSupplier`, `archiveSupplier` (ativo=false); valida documento único por empresa; todos auditados em `prisma.$transaction`.
- `src/domains/purchasing/application/purchase-use-cases.ts` — `createPurchaseOrder` (numero via `nextDocumentNumber`, status RASCUNHO, subtotal/total), `sendPurchaseOrder` (RASCUNHO→ENVIADO), `receivePurchaseOrder` (aplica `applyStockMovement` ENTRADA, status PARCIAL/RECEBIDO, cria `ContaPagar` opcional), `cancelPurchaseOrder` (bloqueia se RECEBIDO/PARCIAL).
- `src/lib/services/purchasing.ts` — `listSuppliers()`, `listPurchaseOrders()` (com statusLabel/tone, percentRecebido, flags canEnviar/canReceber/canCancelar), `getPurchaseOrderDetail(id)` com itens, `listPurchaseFormData()` (fornecedores+produtos com ultimoCusto).
- `src/app/api/erp/fornecedores/route.ts` — POST createSupplier.
- `src/app/api/erp/fornecedores/[id]/route.ts` — PUT updateSupplier, DELETE archiveSupplier.
- `src/app/api/erp/compras/route.ts` — POST createPurchaseOrder.
- `src/app/api/erp/compras/[id]/enviar/route.ts` — POST sendPurchaseOrder.
- `src/app/api/erp/compras/[id]/receber/route.ts` — POST receivePurchaseOrder.
- `src/app/api/erp/compras/[id]/cancelar/route.ts` — POST cancelPurchaseOrder.
- `src/app/api/erp/compras/[id]/detail/route.ts` — GET getPurchaseOrderDetail (usado pelo drawer de recebimento).
- `src/app/erp/fornecedores/page.tsx` — server page `force-dynamic`; conta ativos; renderiza `SuppliersCrud`.
- `src/app/erp/compras/page.tsx` — server page `force-dynamic`; KpiCards (pedidos abertos, a receber, valor em aberto); renderiza `PurchaseList`.
- `src/app/erp/compras/nova/page.tsx` — server page `force-dynamic`; carrega `listPurchaseFormData` e renderiza `PurchaseForm`.
- `src/components/erp/SuppliersCrud.tsx` — client component; lista com busca, drawer criar/editar, arquivar.
- `src/components/erp/PurchaseList.tsx` — client component; lista com filtro status, ações enviar/receber/cancelar; drawer de recebimento com quantidades e opção de gerar ContaPagar.
- `src/components/erp/PurchaseForm.tsx` — client component; seleção de fornecedor, linhas de produto (auto-fill ultimoCusto), frete, totais dinâmicos, POST e redirect para /erp/compras.

### T1 Vendas — concluído

**Arquivos criados:**
- `src/domains/sales/application/sale-use-cases.ts` — já existia com `createSale`, `confirmSale`, `invoiceSale`, `cancelSale` completos; nenhuma alteração necessária.
- `src/lib/services/sales.ts` — `listSales()`, `getSaleDetail()`, `listSaleFormData()` com tratamento de ausência de DATABASE_URL.
- `src/app/api/erp/vendas/route.ts` — POST createSale (400 validação / 500 inesperado).
- `src/app/api/erp/vendas/[id]/confirmar/route.ts` — POST confirmSale.
- `src/app/api/erp/vendas/[id]/faturar/route.ts` — POST invoiceSale (aceita `modelo` no body).
- `src/app/api/erp/vendas/[id]/cancelar/route.ts` — POST cancelSale.
- `src/app/erp/vendas/page.tsx` — server page `force-dynamic`; KpiCards (pedidos abertos, faturados, valor em aberto); `SalesList`.
- `src/app/erp/vendas/nova/page.tsx` — server page `force-dynamic`; carrega `listSaleFormData` e renderiza `SaleForm`.
- `src/components/erp/SalesList.tsx` — client component; busca, tabela com ações confirmar/emitir NF-e/cancelar via fetch; atualiza linha no estado local.
- `src/components/erp/SaleForm.tsx` — client component; seleção de cliente, linhas de produto com qtd/preço/desconto (auto-fill preço ao selecionar produto), totais dinâmicos, POST para /api/erp/vendas e redirect para /erp/vendas.

**Observações:**
- `canceladoEm` adicionado ao tipo `SaleSummary` em services/sales.ts (campo existia no schema, apenas faltava na tipagem do service).
- `invoiceSale` NÃO roda dentro de transação que envolva `emitFiscalDocument` — atualizações do pedido ocorrem em transação separada após retorno da emissão, conforme instrução.
- Cancelamento bloqueia se `temNotaAutorizada`, orientando o usuário a cancelar a nota antes.

### T3 Financeiro — concluído

Arquivos criados/utilizados:

- `src/domains/finance/application/finance-use-cases.ts` — use-cases já existia; contém `settlePayable`, `settleReceivable`, `createPayable`, `createReceivable` (todos em `prisma.$transaction` com `createAuditLog`, validação de saldo devedor, atualização de `ContaBancaria` e criação de `MovimentoFinanceiro`).
- `src/lib/services/finance.ts` — `listPayables`, `listReceivables`, `listBankAccounts`, `getFinanceSummary`, `getCashFlow`; status "Vencido" calculado em runtime (sem alterar enum).
- `src/app/api/erp/financeiro/contas-pagar/route.ts` — POST `createPayable`.
- `src/app/api/erp/financeiro/contas-pagar/[id]/baixar/route.ts` — POST `settlePayable`.
- `src/app/api/erp/financeiro/contas-receber/route.ts` — POST `createReceivable`.
- `src/app/api/erp/financeiro/contas-receber/[id]/baixar/route.ts` — POST `settleReceivable`.
- `src/components/erp/FinanceManager.tsx` — client component: abas A Pagar/A Receber, busca, tabela com StatusBadge, modal de baixa (juros/multa/desconto/conta bancária), modal "Nova conta".
- `src/components/erp/CashFlowView.tsx` — client component: KPIs de saldo/entradas/saídas projetadas, tabela dia-a-dia com saldo acumulado, filtro 30/60/90 dias, resumo realizado.
- `src/app/erp/financeiro/page.tsx` — server page `force-dynamic`: KPIs + `FinanceManager`.
- `src/app/erp/fluxo-caixa/page.tsx` — server page `force-dynamic`: `CashFlowView`.

### T2 Estoque — concluído

**Arquivos criados:**
- `src/lib/services/stock.ts` — já existia com `listStockBalances`, `listStockMovements`, `listDepositos`, `listInventories`, `getInventoryDetail`, `listProdutosOptions`; mantido sem alteração.
- `src/domains/stock/application/stock-adjust-use-cases.ts` — `adjustStock` (calcula delta vs saldo atual, aplica ENTRADA ou SAIDA via `applyStockMovement`, documenta como AJUSTE_ESTOQUE, audita); `transferStock` (SAIDA no depósito de origem + ENTRADA no destino com mesmo custoUnitario, dentro de uma transação, mesmo documentoId, audita).
- `src/domains/stock/application/inventory-use-cases.ts` — `createInventory` (numero INV via `nextDocumentNumber`, cria `InventarioItem` para cada produto ativo com saldo do depósito, audita); `countInventoryItem` (grava saldoContado, contado=true, avança status para EM_CONTAGEM); `finalizeInventory` (FINALIZADO; para cada item contado com diferença, aplica `applyStockMovement` ENTRADA/SAIDA com documentoTipo INVENTARIO, marca ajustado=true, bloqueia se já FINALIZADO/CANCELADO, audita).
- `src/app/api/erp/estoque/ajuste/route.ts` — POST; valida produtoId, novaQuantidade, motivo; chama `adjustStock`.
- `src/app/api/erp/estoque/transferencia/route.ts` — POST; valida produtoId, depositoOrigemId, depositoDestinoId, quantidade; chama `transferStock`.
- `src/app/api/erp/inventarios/route.ts` — POST; valida depositoId; chama `createInventory`; devolve id + numero.
- `src/app/api/erp/inventarios/[id]/contagem/route.ts` — POST; valida itemId, saldoContado; chama `countInventoryItem`.
- `src/app/api/erp/inventarios/[id]/finalizar/route.ts` — POST; chama `finalizeInventory`; devolve status + ajustesRealizados.
- `src/app/erp/estoque/page.tsx` — server page `force-dynamic`; KpiCards (SKUs com saldo, valor total a custo, itens críticos, itens zerados); renderiza `StockManager`.
- `src/app/erp/inventarios/[id]/page.tsx` — server page `force-dynamic`; carrega `getInventoryDetail`, exibe header com status/depósito/datas; renderiza `InventoryCount`.
- `src/components/erp/StockManager.tsx` — client component; abas Saldos | Movimentações | Inventários; formulários inline de ajuste e transferência (fetch via API); lista de inventários com ação "Novo inventário" e navegação para detalhe.
- `src/components/erp/InventoryCount.tsx` — client component; tabela de itens com campo de contagem editável por linha, salva item a item via POST, exibe diferença com StatusBadge, botão "Finalizar inventário" com confirmação.
