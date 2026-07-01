# Backlog — ERP JR Brasil

Lista de melhorias e correções a fazer, para retomada por qualquer assistente/dev.
Convenções do projeto: responder em pt-BR; **nada hardcoded / multi-tenant** (dados da empresa sempre
do cadastro); fluxo de deploy = desenvolve local → `git push` → `./deploy/vps.sh deploy` (nunca dev na VPS).

Última atualização: 2026-07-01.

---

## 1. Financeiro / Bancário

- [ ] **Emissão de boleto** — gerar boleto a partir dos recebíveis (`ContaReceber`): convênio/carteira do
  banco, nosso número, linha digitável/código de barras, PDF, registro (CNAB ou API do banco). Não existe hoje.
- [ ] **Integração bancária** — extrato + baixa automática de recebíveis/pagáveis + remessa/retorno
  (CNAB ou API/Open Finance). É a base para o boleto e para a antecipação. Definir **qual banco/provedor**
  (Sicoob/BB/Itaú/Inter ou agregador tipo Asaas/Cobre Fácil) — isso destrava os itens 1 e abaixo.
- [ ] **API de consulta de clientes (bureau de crédito)** — integrar Serasa/SPC/similar na análise de
  crédito/venda. Provedor a definir; entra no cadastro/fluxo de venda.
- [ ] **Antecipação de boletos/recebíveis** (MAIOR IMPACTO — distorce relatório hoje). O cliente vende em
  boletos e às vezes antecipa os recebíveis. **Hoje lança as taxas MANUALMENTE e os relatórios NÃO BATEM.**
  Fazer um fluxo próprio: selecionar os recebíveis a antecipar, informar bruto × taxa/deságio × líquido
  creditado; o sistema registra a taxa como **despesa financeira**, baixa o recebível como **antecipado**
  (não como recebido do cliente na data original) e credita o líquido no caixa — para DRE/apuração fechar.

## 2. Emissão de NF-e (saída)

- [ ] **Frete não sai na nota fiscal (BUG).** O frete informado na emissão não aparece na NF-e. Investigar:
  `document.valorFrete` chega ao `notaScalarData` (`src/domains/fiscal/application/fiscal-emission-use-cases.ts`,
  ~linha 602) e ao `total`, mas conferir se vai ao XML — `ICMSTot/vFrete` e grupo `transp` (modFrete/vol) no
  `document-builder` / provedores (SEFAZ/ACBr) — e se o valor é capturado do formulário de emissão.
- [ ] **Nº do pedido em Informações Complementares.** Quando a NF-e vem de um pedido de venda, concatenar
  "Pedido nº X" no `infCpl` (infAdic) do XML. Hoje o `infCpl` traz só o texto do IBPT (Lei 12.741) + o
  digitado pelo usuário.

## 3. Contas a pagar / receber

- [x] **Estorno de baixa** — FEITO (rotas `/api/erp/financeiro/contas-*/{id}/estornar` + botão "Estornar
  baixa" no FinanceManager; desfaz pagamento e ajusta saldo bancário).
- [x] **Classificação financeira + Fechamento mensal (2026-07-01)** — FEITO: plano de classificações
  gerencial (grupo → classificação, meta mensal IDEAL) em `/erp/financeiro/classificacoes` (plano padrão
  com 1 clique), coluna "Classificação" com select inline no financeiro, auto-classificação das contas de
  entrada fiscal (por finalidade + memória do fornecedor) e aba **Fechamento mensal** nos relatórios
  (IDEAL × REAL por grupo/classificação + títulos pagos por classificação + export CSV). Substitui o
  fechamento que o cliente fazia no Excel.
- [ ] **Melhorar os RELATÓRIOS de contas a pagar/receber** (escopo fechado com o usuário — 4 visões). Hoje
  `financeReport` (`src/lib/services/reports.ts`) traz só totais em aberto/vencido + aging por status.
  Dados em `ContaReceber`/`ContaPagar` (vencimento, valor, valorPago, pagoEm, status, cliente/fornecedor):
  1. **Fluxo de caixa projetado** — a receber × a pagar por data futura, com saldo projetado dia/semana/mês.
  2. **Por cliente/fornecedor** — total a receber por cliente e a pagar por fornecedor (ranking).
  3. **Previsto × realizado** — previsto receber/pagar no período × o que de fato entrou/saiu.
  4. **Aging + exportação** — aging por faixa de dias de atraso + exportar PDF/Excel.

## Itens opcionais / menores

- [ ] Padronizar `formaPagamentoId` (FK) em vez de texto livre; parcelas de cartão gerando sub-parcelas no
  contas a pagar (hoje só registra o nº da parcela).
