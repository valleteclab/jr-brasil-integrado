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
- [x] 1.2 **Integração bancária (Sicoob) — fase 2** — FEITO 2026-07-02 (validado no sandbox; produção
  depende do credenciamento + escopos webhooks/cob/pix/cco):
  - **Webhook de liquidação (tempo real)**: botão "⚡ Ativar tempo real" no card Cobrança Sicoob;
    cadastra POST /webhooks (tipo mov. 7) com URL pública secreta /api/webhooks/sicoob/cobranca/{segredo};
    o receiver NUNCA confia no corpo — re-consulta a API antes de baixar. Cron 30min segue como rede
    de segurança.
  - **Gestão do boleto no banco**: "Prorrogar" (PATCH prorrogacaoVencimento, ajusta título) e
    "Baixar no banco" (PATCH /boletos/{nn}/baixar — resolve o boleto órfão) direto no financeiro.
  - **Pix Recebimentos (QR dinâmico)**: model PixCobranca (migration 20260702230000); provider
    sicoob-pix.ts (PUT/GET cob BACEN v2); "Pix QR" no título do contas a receber (pagamento → baixa
    AUTOMÁTICA), "▦ QR Pix" na linha PIX do Caixa e do PDV (QR + copia-e-cola + verificar); cron
    sincroniza cobranças ativas junto com os boletos. Chave recebedora = chave Pix da conta bancária.
  - **Extrato/conciliação (conta-corrente v4)**: página /erp/financeiro/extrato — saldo real + extrato
    do período conciliado com os MovimentoFinanceiro (CONCILIADO / SÓ NO BANCO / SÓ NO ERP) e
    **detecção de créditos de ANTECIPAÇÃO DE RECEBÍVEIS** (casa com as operações da tela de
    Antecipação — cliente antecipa no Sicoob hoje; não há API própria de antecipação no portal).
  - Pendentes menores: registrar webhook Pix da chave (provider pronto, sem UI), Pix com vencimento
    (cobv), boleto híbrido com QR Pix embutido (grupo `pix.utilizarPix` do PATCH v3).
- [ ] 1.3 **API de consulta de clientes (bureau de crédito)** — integrar Serasa/SPC/similar na análise de
  crédito/venda. Provedor a definir; entra no cadastro/fluxo de venda.
- [x] 1.7 **Apuração Simples Nacional / MEI com SEGREGAÇÃO de receitas** — FEITO 2026-07-02: página
  /erp/fiscal/simples (link em Relatórios). RBT12 (proporcionalizado p/ empresa nova), alíquota
  efetiva LC 123 (tabelas anexos I–V + partilha por tributo em src/domains/fiscal/simples/
  tabelas-lc123.ts), DAS estimado COM × SEM segregação e a ECONOMIA do mês em destaque: receita de
  produto MONOFÁSICO (flag ProdutoFiscal.pisCofinsMonofasico OU NCM nas listas das Leis
  10.485/10.147/13.097/9.718) sai de PIS/COFINS; ICMS-ST (flag icmsSt / CSOSN 500 / CST 60) sai do
  ICMS. Botão "Detectar monofásicos por NCM" (marcação em massa, só ativa). Fator R (folha mensal
  na empresa), alertas de sublimite 3,6M/limite 4,8M. MEI: painel de limite anual (81k) com % 
  consumido, projeção e alertas de desenquadramento. Enquadramento (anexo+folha) salvo na Empresa.
  Impressão p/ contador (conferência do PGDAS-D). DISCLAIMER: estimativa gerencial — oficial é o
  PGDAS-D. Futuro: detalhamento por produto/nota da segregação (anexo p/ contador), receita sem
  nota (recibo) opcional, export CSV.
- [x] 1.6 **Despesas recorrentes (folha, aluguel, energia...)** — FEITO 2026-07-02: página
  /erp/financeiro/recorrentes — modelo com descrição, fornecedor, valor (fixo ou VARIÁVEL =
  estimativa ajustada na baixa), periodicidade (mensal a anual), dia do vencimento (clamp fim de
  mês), início/fim, forma, conta e classificação. Geração AUTOMÁTICA das ContaPagar por competência
  (na criação + cron de 30min), idempotente pelo unique (recorrenciaId, competência "AAAA-MM").
  Pausar (para de gerar), reativar e encerrar (cancela as abertas). Origem RECORRENTE.
  Futuro: reajuste anual programado (aluguel), recorrência de RECEITAS (mensalidades).
- [x] 1.5 **Empréstimos e financiamentos (contas a pagar estruturado)** — FEITO 2026-07-02: página
  /erp/financeiro/emprestimos — contrato com instituição/credor, nº, principal, taxa % a.m., sistema
  de amortização (PRICE, SAC, parcela do carnê, sem juros), total de parcelas, **parcelas já pagas**
  (migração de contrato antigo) e 1º vencimento. Simulação do cronograma ANTES de salvar (mesma
  função do servidor); parcelas em aberto viram ContaPagar (origem EMPRESTIMO, decomposição
  juros+amortização na observação); **saldo devedor derivado** do cronograma + pagas (nunca digitado);
  detalhe com cronograma completo; cancelamento do contrato cancela as parcelas abertas.
  Futuro: quitação antecipada com desconto de juros; renegociação (novo contrato vinculado);
  despesa de juros separada da amortização no fechamento (hoje a parcela inteira vai na classificação
  escolhida).
- [x] 1.4 **Antecipação de recebíveis (v1 sem banco)** — FEITO 2026-07-02: tela
  /erp/financeiro/antecipacao (seleção de títulos + taxa em R$ ou % + conta creditada + histórico).
  Efeitos em uma transação: títulos baixados pelo BRUTO (forma ANTECIPACAO, rastreados por
  AntecipacaoRecebivel), crédito na conta, taxa como ContaPagar PAGA classificada "Juros de antecipação"
  → líquido no saldo, fechamento/DRE batem. Testado ponta a ponta. Refinamentos futuros: estorno da
  operação inteira; regresso (cliente não paga o boleto antecipado, banco debita de volta).

## 1b. Boleto / fluxo de venda (refinamentos)

- [x] 1b.1 **Imprimir boletos na tela de VENDAS** — FEITO 2026-07-01: botão "🖨 Boletos" na lista de
  /erp/vendas (vendas em boleto pós-confirmação) expande as parcelas com link do PDF, linha
  digitável no hover e status (paga / registrado sem PDF / sem boleto). Usa
  GET /api/erp/vendas/{id}/boletos.
- [x] 1b.2 **Atendimento: ao escolher forma "Boleto" na Venda balcão, sugerir o tipo "Pedido
  faturado"** — FEITO 2026-07-01 (hint na Venda balcão; o balcão via caixa continua funcionando).
- [x] 1b.3 **Valores POR PARCELA editáveis no boleto** — FEITO 2026-07-01: input R$ ao lado de cada
  vencimento nas 3 telas (Caixa, PDV, Atendimento/Pedido faturado); padrão divisão igual (resto na
  última), aviso quando a soma difere e validação no servidor (tolerância R$ 0,02).

## 2. Emissão de NF-e (saída)

- [x] 2.a **Auto-marcar PIS/COFINS monofásico na importação do XML de entrada** — FEITO 2026-07-02:
  além do ICMS-ST (que já era detectado por CST 60/10/30/70, CSOSN 201/202/203/500 e CFOP), a
  entrada agora marca ProdutoFiscal.pisCofinsMonofasico quando o item do fornecedor vem com CST de
  PIS 04/05 OU o NCM está nas listas de lei — alimenta a segregação do Simples sem trabalho manual.
- [x] 2.b **Venda interestadual de produto ST (remetente = substituto) + guias GNRE** — FEITO
  2026-07-02, fontes oficiais: XSD leiaute 4.00 local (grupos ICMSSN201/202) + Convênio ICMS
  142/2018 (CONFAZ; cl. 11ª §1º MVA original p/ Simples, cl. 13ª §1º dedução pela alíquota
  interestadual, cl. 18ª GNRE por operação antes da saída):
  - **Gatilho = RegraTributaria de ICMS com NCM + ufDestino + MVA** (protocolo/convênio cadastrado,
    com o contador): venda interestadual de produto ST deixa de sair 500/6404 e sai **CSOSN 202
    (ou 201) / CST 10 + CFOP 6403** com grupo ICMSST calculado. Sem regra p/ a UF → mantém 500/6404
    (sem protocolo, correto). Interna continua 500/5405 intocada.
  - Cálculo validado: Simples usa MVA ORIGINAL + dedução interestadual (BA→SP 12%: base 1000, MVA
    71,78 → BC-ST 1.717,80, ST 189,20); regime normal usa **MVA AJUSTADA** automática (84,35% no
    mesmo caso) com ICMS próprio destacado. Fix: regra só-de-ST sem alíquota própria não zera o
    ICMS próprio; fix XSD: pCredSN/vCredICMSSN obrigatórios no ICMSSN201.
  - **XML VÁLIDO contra o XSD oficial** (wrap-nfe) e emissão de TESTE em homologação SEFAZ-BA
    passou do schema (rejeição só cadastral, cStat 234 — IE fictícia; com cliente real autoriza).
  - **GuiaRecolhimento** (migration 20260703060000): NF-e autorizada interestadual com ST retido →
    guia GNRE PENDENTE p/ UF de destino + texto no infCpl (DANFE); tela /erp/fiscal/guias
    (alerta "recolher antes da saída", link gnre.pe.gov.br, registrar pagamento c/ nº da guia);
    cancelamento da NF-e cancela a guia pendente.
  - Fase 2 (pendente): DIFAL EC 87 (grupo ICMSUFDest p/ consumidor final interestadual — hoje não
    suportado) e emissão da guia via webservice GNRE Online; cadastro assistido de MVAs por
    protocolo (ex.: Protocolo 41/2008 autopeças).

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
