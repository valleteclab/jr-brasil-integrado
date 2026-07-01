# Backlog — ERP JR Brasil

Lista de melhorias e correções a fazer, para retomada por qualquer assistente/dev.
Convenções do projeto: responder em pt-BR; **nada hardcoded / multi-tenant** (dados da empresa sempre
do cadastro); fluxo de deploy = desenvolve local → `git push` → `./deploy/vps.sh deploy` (nunca dev na VPS).

Última atualização: 2026-07-02.

---

## ORDEM DE EXECUÇÃO (por dependência)

1. ~~Classificação financeira + fechamento mensal~~ ✅ (base dos relatórios financeiros)
2. ~~Automação da classificação (backfill + recebíveis na origem)~~ ✅
3. ~~Bug do frete na NF-e~~ ✅
4. **Nº do pedido no infCpl** (pequeno, mesma área da emissão) → item 2.1
5. **4 visões de relatórios financeiros** (usa a classificação já feita) → item 3.1
6. **Entradas de notas / vínculo de produtos** (reduzir trabalho na conferência) → seção 4
7. **Antecipação de recebíveis** (v1 SEM banco: fluxo manual estruturado; usa a classificação
   "Juros de antecipação" que já existe no plano) → item 1.4
8. **Emissão de boleto + integração bancária + bureau** — DEPENDEM de decidir **qual banco/provedor**
   (Sicoob/BB/Itaú/Inter ou agregador Asaas/Cobre Fácil). Decisão com o cliente ANTES de codar → itens 1.1–1.3

## 1. Financeiro / Bancário

- [ ] 1.1 **Emissão de boleto** — gerar boleto a partir dos recebíveis (`ContaReceber`): convênio/carteira do
  banco, nosso número, linha digitável/código de barras, PDF, registro (CNAB ou API do banco). Não existe hoje.
  **Bloqueado por: escolha do banco/provedor.**
- [ ] 1.2 **Integração bancária** — extrato + baixa automática de recebíveis/pagáveis + remessa/retorno
  (CNAB ou API/Open Finance). É a base para o boleto e para a antecipação. **Bloqueado por: escolha do banco.**
- [ ] 1.3 **API de consulta de clientes (bureau de crédito)** — integrar Serasa/SPC/similar na análise de
  crédito/venda. Provedor a definir; entra no cadastro/fluxo de venda.
- [ ] 1.4 **Antecipação de boletos/recebíveis** (ALTO IMPACTO — distorce relatório hoje). O cliente vende em
  boletos e às vezes antecipa os recebíveis. Hoje lança as taxas manualmente e os relatórios não batem.
  **v1 sem integração bancária:** selecionar os recebíveis a antecipar, informar bruto × taxa/deságio ×
  líquido creditado; o sistema baixa os recebíveis como ANTECIPADOS, lança a taxa como despesa financeira
  (classificação "Juros de antecipação", já existe no plano padrão) e credita o líquido na conta bancária —
  DRE/fechamento passam a bater. A integração bancária (1.2) depois só automatiza a entrada dos dados.

## 2. Emissão de NF-e (saída)

- [x] 2.0 **Frete não sai na nota fiscal (BUG)** — CORRIGIDO 2026-07-02: o frete chegava ao XML só no
  ICMSTot, sem rateio nos itens (`det/prod/vFrete`), violando a regra da SEFAZ "ICMSTot.vFrete = Σ itens"
  (rejeição 610). Agora o `buildDocumentFromPedido` rateia o frete pelos itens (resíduo no último) e o
  `modFrete` é forçado a 0 (CIF) quando há frete com modalidade 9/vazia. Cobre pedido, caixa e avulsa
  (todos passam pelo mesmo builder), nos dois provedores (SEFAZ e ACBr).
- [ ] 2.1 **Nº do pedido em Informações Complementares.** Quando a NF-e vem de um pedido de venda, concatenar
  "Pedido nº X" no `infCpl` (infAdic) do XML. Hoje o `infCpl` traz só o texto do IBPT (Lei 12.741) + o
  digitado pelo usuário.
- [ ] 2.2 (refinamento fiscal) **Frete na base do ICMS** — para emitente de regime NORMAL, o frete rateado
  deve compor a base do ICMS do item (base = vProd − vDesc + vFrete). Hoje o tax-engine não soma o frete à
  base. Sem efeito para o piloto (Simples Nacional / CSOSN); tratar quando houver cliente em regime normal.

## 3. Contas a pagar / receber

- [x] 3.0a **Estorno de baixa** — FEITO (rotas `/api/erp/financeiro/contas-*/{id}/estornar` + botão).
- [x] 3.0b **Classificação financeira + Fechamento mensal** — FEITO 2026-07-01 (plano em
  `/erp/financeiro/classificacoes`, coluna com select inline, aba "Fechamento mensal" IDEAL×REAL + títulos
  pagos por classificação + CSV).
- [x] 3.0c **Automação total da classificação** — FEITO 2026-07-02: contas de entrada fiscal já nascem
  classificadas (finalidade predominante + memória do fornecedor); recebíveis de venda/PDV/adquirente/OS
  nascem como "Receita de vendas"/"Receita de serviços"; backfill classifica o legado (roda no seed do
  plano e no botão "Classificar contas existentes").
- [ ] 3.1 **4 visões de relatórios de contas a pagar/receber** (escopo fechado com o usuário). Hoje
  `financeReport` (`src/lib/services/reports.ts`) traz só totais em aberto/vencido + aging por status:
  1. **Fluxo de caixa projetado** — a receber × a pagar por data futura, com saldo projetado dia/semana/mês.
  2. **Por cliente/fornecedor** — total a receber por cliente e a pagar por fornecedor (ranking).
  3. **Previsto × realizado** — previsto receber/pagar no período × o que de fato entrou/saiu.
  4. **Aging + exportação** — aging por faixa de dias de atraso + exportar PDF/Excel.

## 4. Entradas de notas / vínculo de produtos (reduzir trabalho na conferência)

Objetivo: o mínimo de cliques entre "XML chegou" e "estoque/financeiro lançados". A detalhar com o usuário
na próxima sessão de trabalho nesta área; pontos já conhecidos:

- [ ] 4.1 **Memória de vínculo por fornecedor** — garantir que o par (fornecedor, código do produto no
  fornecedor) → produto vinculado seja gravado na primeira conferência e reutilizado nas próximas notas
  automaticamente (com `revisarVinculo=false` quando a memória bate). Verificar o que `matchProduct` já
  cobre e o que ainda cai em revisão manual repetida.
- [ ] 4.2 **Conferência em lote** — aprovar de uma vez os itens com vínculo de alta confiança, revisando só
  as exceções (hoje item a item).
- [ ] 4.3 **Regras De/Para de finalidade por fornecedor/NCM** — já existem (`finalidade-regra-use-cases`);
  avaliar tela de gestão e cobertura.
- [ ] 4.4 **Criação automática de produto** na entrada (novo SKU direto do item do XML com preço de venda
  por markup padrão) — hoje exige passos manuais; avaliar com o usuário.

## Itens opcionais / menores

- [ ] Padronizar `formaPagamentoId` (FK) em vez de texto livre; parcelas de cartão gerando sub-parcelas no
  contas a pagar (hoje só registra o nº da parcela).
- [ ] Fechamento mensal: orçamento (IDEAL) por competência (hoje é um valor único por classificação);
  "meta de reserva" do Excel do cliente.
- [ ] Integrar o módulo de GASTOS (cupom por foto, campo `categoria` texto livre) ao plano de
  classificações financeiras.
