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
4. ~~Nº do pedido no infCpl~~ ✅ 2026-07-02
5. ~~4 visões de relatórios financeiros~~ ✅ 2026-07-02 (aba Financeiro dos relatórios)
6. ~~Entradas de notas / vínculo de produtos (1ª leva)~~ ✅ 2026-07-02 (memória no vínculo manual,
   IA prioriza histórico do fornecedor, ação em massa "novo SKU") — restam 4.3/4.4 da seção 4
7. ~~Antecipação de recebíveis (v1 sem banco)~~ ✅ 2026-07-02
8. **Boleto/integração bancária: DECIDIDO SICOOB (API oficial)** — emissão de boleto FEITA 2026-07-02
   (ver 1.1); pendências: credenciamento do cliente, webhook/cron de liquidação, extrato/conciliação (1.2)
   e bureau (1.3, provedor a definir)

## 1. Financeiro / Bancário

- [x] 1.1 **Emissão de boleto (Sicoob API v3)** — FEITO 2026-07-02: config por conta bancária em
  Configurações → Contas financeiras (card "Cobrança Sicoob": client_id, nº do beneficiário, produção
  com mTLS pelo A1 da empresa OU sandbox por token); botão "Gerar boleto" no recebível (registra na API,
  guarda nossoNumero/linha digitável/PDF, valida CPF/CNPJ+endereço do cliente); 2ª via PDF; botão
  "Consultar pgto" sincroniza a situação e BAIXA o título automaticamente quando liquidado (crédito na
  conta, data do banco). Model BoletoCobranca (migration 20260702150000); provider
  src/domains/finance/providers/sicoob-cobranca.ts. **PENDENTE p/ ativar: credenciamento do cliente no
  Sicoob (client_id) — testar 1º em sandbox com token do portal dev. NÃO TESTADO contra a API real.**
- [~] 1.2 **Integração bancária (Sicoob)** — PARCIAL 2026-07-02: cron de sincronização FEITO
  (/api/cron/boletos a cada 30min no crontab da VPS; boleto liquidado → baixa automática do título com
  CRÉDITO na conta bancária na data do banco). Venda com forma "boleto" gera automaticamente um boleto
  POR PARCELA (hook no confirmSale, best-effort). Pendentes: webhook de liquidação (em vez de polling),
  extrato/conciliação (API conta-corrente v4), Pix, e cancelar/baixar boleto no banco quando a conta é
  cancelada/editada no ERP (hoje o boleto fica órfão no Sicoob).
- [ ] 1.3 **API de consulta de clientes (bureau de crédito)** — integrar Serasa/SPC/similar na análise de
  crédito/venda. Provedor a definir; entra no cadastro/fluxo de venda.
- [x] 1.4 **Antecipação de recebíveis (v1 sem banco)** — FEITO 2026-07-02: tela
  /erp/financeiro/antecipacao (seleção de títulos + taxa em R$ ou % + conta creditada + histórico).
  Efeitos em uma transação: títulos baixados pelo BRUTO (forma ANTECIPACAO, rastreados por
  AntecipacaoRecebivel), crédito na conta, taxa como ContaPagar PAGA classificada "Juros de antecipação"
  → líquido no saldo, fechamento/DRE batem. Testado ponta a ponta. Refinamentos futuros: estorno da
  operação inteira; regresso (cliente não paga o boleto antecipado, banco debita de volta).

## 1b. Boleto / fluxo de venda (refinamentos)

- [ ] 1b.1 **Imprimir boletos na tela de VENDAS (fluxo Pedido faturado)** — o endpoint
  GET /api/erp/vendas/{id}/boletos já existe; falta o botão na lista/detalhe de /erp/vendas
  (pós-confirmação, os boletos são gerados automaticamente pelo hook do confirmSale).
- [ ] 1b.2 **Atendimento: ao escolher forma "Boleto" na Venda balcão, sugerir o tipo "Pedido
  faturado"** (boleto é venda a prazo; o balcão via caixa continua funcionando para "leva agora,
  paga boleto").
- [ ] 1b.3 Valores POR PARCELA editáveis no boleto (hoje as datas são editáveis; os valores são
  divididos igualmente com resíduo na última).

## 2. Emissão de NF-e (saída)

- [x] 2.0 **Frete não sai na nota fiscal (BUG)** — CORRIGIDO 2026-07-02: o frete chegava ao XML só no
  ICMSTot, sem rateio nos itens (`det/prod/vFrete`), violando a regra da SEFAZ "ICMSTot.vFrete = Σ itens"
  (rejeição 610). Agora o `buildDocumentFromPedido` rateia o frete pelos itens (resíduo no último) e o
  `modFrete` é forçado a 0 (CIF) quando há frete com modalidade 9/vazia. Cobre pedido, caixa e avulsa
  (todos passam pelo mesmo builder), nos dois provedores (SEFAZ e ACBr).
- [x] 2.1 **Nº do pedido em Informações Complementares** — FEITO 2026-07-02: `buildDocumentFromPedido`
  aceita `numeroPedido` e prefixa "Pedido nº X." no infCpl; venda e caixa passam `pedido.numero`.
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
- [x] 3.1 **4 visões de relatórios de contas a pagar/receber** — FEITO 2026-07-02 na aba Financeiro de
  /erp/relatorios: fluxo projetado (saldo atual + 30/60/90, reusa getCashFlow), ranking a receber por
  cliente / a pagar por fornecedor (top 20, com vencido), previsto × realizado do mês (vencimentos ×
  baixas via MovimentoFinanceiro, filtro ?mes=&ano=), aging (já existia) + export CSV
  (/api/erp/relatorios/financeiro/csv). Serviço: src/lib/services/finance-relatorios.ts.

## 4. Entradas de notas / vínculo de produtos (reduzir trabalho na conferência)

Objetivo: o mínimo de cliques entre "XML chegou" e "estoque/financeiro lançados". A detalhar com o usuário
na próxima sessão de trabalho nesta área; pontos já conhecidos:

- [x] 4.1 **Memória de vínculo por fornecedor** — FEITO 2026-07-02. Já existia: `matchProduct` vincula por
  SKU (100%) → GTIN (92%) → ProdutoFornecedor (95%), e `processFiscalEntry` grava ProdutoFornecedor.
  Adicionado: o VÍNCULO MANUAL na conferência também grava a memória na hora (upsert em
  `updateFiscalEntryItemLinkInTransaction`) e a sugestão de IA prioriza o histórico do fornecedor
  (produtos do ProdutoFornecedor entram primeiro no corte de 200).
- [x] 4.2 **Conferência em lote (1ª leva)** — FEITO 2026-07-02: botão "Não vinculados → novo SKU" no
  wizard marca todos os itens sem produto de uma vez (fornecedor novo). Obs.: vínculos automáticos
  confiáveis já entram com revisarVinculo=false (não precisam de aprovação).
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
