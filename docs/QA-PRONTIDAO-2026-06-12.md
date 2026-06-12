# Relatório de Prontidão para Produção — ERP XERP

**Data:** 2026-06-12
**Método:** auditoria de código em 5 frentes paralelas (Vendas/PDV/Caixa, Fiscal, Cadastros/Estoque/Compras, Financeiro/Gastos/Orçamento/OS, Multi-tenant/Admin/Segurança) + teste funcional E2E dirigido contra o banco de teste (Railway), operando como um usuário (cadastro → venda → confirmação → cancelamento → recebimento → financeiro).

## Veredito geral

**Ainda NÃO está pronto para o primeiro cliente operar sem supervisão.** O caminho feliz funciona (vender no balcão, baixar estoque, abrir/fechar caixa, emitir cupom), mas há **14 bloqueadores** que corrompem estoque/caixa/financeiro em cenários reais (erro, concorrência, cancelamento) ou geram rejeição da SEFAZ. A base é sólida (multi-tenant escopado, criptografia de segredos, RBAC desenhado), o que torna as correções pontuais e factíveis.

Prioridade sugerida: **fechar os bloqueadores de Estoque/Caixa/Financeiro e Fiscal antes do go-live**; os de Segurança (loja pública + RBAC nas APIs) antes de expor a loja.

---

## 🔴 Bloqueadores (corrigir antes do go-live)

### Vendas / PDV / Caixa
1. **Cancelar venda em `AGUARDANDO_NOTA` NÃO repõe o estoque** — `sale-use-cases.ts:740-743`. O cancelamento só faz ENTRADA de estoque para status `ENVIADO`/`ENTREGUE`; em `AGUARDANDO_NOTA` (já confirmado, estoque baixado) cai no `releaseReservations`, que não devolve saldo. **✅ CONFIRMADO no teste E2E** (saldo 11→9 na venda, ficou 9 após cancelar). Correção: tratar `AGUARDANDO_NOTA` como já-baixado (fazer ENTRADA).
2. **PDV pode emitir NFC-e + baixar estoque sem registrar o recebimento no caixa** — `pdv-use-cases.ts:67-257`. Se o passo de registrar o recebimento (passo 3) falhar (caixa fechado entre a leitura e a gravação, erro de conta/máquina), a venda fica emitida e baixada, mas sem `PagamentoVenda`/movimento de caixa — dinheiro entra na gaveta sem rastro e o fechamento não bate. Correção: registrar pagamento+caixa na mesma transação do checkout ou retornar erro recuperável.
3. **Recebimento/fechamento de caixa sem trava de concorrência** — `cashier-use-cases.ts:192-272, 387`. O status do caixa é lido fora da transação; um recebimento concorrente com um fechamento grava movimento em turno já conferido. Correção: revalidar `status === "ABERTO"` dentro da transação / lock por `caixaId`.

### Fiscal
4. **`dhEmi` enviado em UTC com sufixo `Z`** — `acbr-provider.ts:652` (`new Date().toISOString()`). A SEFAZ exige `AAAA-MM-DDThh:mm:ss-03:00` (offset explícito, hora de Brasília). Causa rejeição de schema e, perto da meia-noite, rejeição 703. O helper correto `fiscalDateTimeSaoPaulo()` já existe (linha 104) mas só é usado na NFS-e. **Afeta toda NF-e e NFC-e.**
5. **Desconto por item quebra `vNF`/`vDesc`** — `fiscal-emission-use-cases.ts:406-415` + `acbr-provider.ts:636,670`. O total usa valor bruto e o `ICMSTot.vDesc` usa `document.valorDesconto`, mas cada item leva `prod.vDesc = item.desconto`. Com desconto na linha (PDV/caixa), `vProd - vDesc ≠ vNF` e `sum(item.vDesc) ≠ total.vDesc` → rejeição em qualquer venda com desconto de item.
6. **`tPag = 99` sem `xPag`** — `acbr-provider.ts:239` (buildPag fallback). Sem forma de pagamento mapeável, `mapTpPag` retorna "99" (outros), que a SEFAZ rejeita sem o campo `xPag`. Correção: forçar forma válida ou preencher `xPag`.
7. **Devolução recalcula tributos em vez de espelhar a nota original** — `fiscal-emission-use-cases.ts:394-401`. A NF-e de devolução recomputa ICMS/base pelas regras atuais; deveria copiar os valores da nota referenciada (`notaOrigemId`), senão diverge da original e do SPED.

### Cadastros / Estoque
8. **`processFiscalEntry` reprocessa entrada `ESTORNADA`** — `fiscal-entry-use-cases.ts:776`. O guard só barra `ESTOQUE_PROCESSADO`; reprocessar uma entrada estornada readiciona estoque, recalcula custo médio e recria as contas a pagar. Correção: barrar tudo que não seja `AGUARDANDO_CONFERENCIA`.
9. **Custo médio corrompe quando `saldoAntes <= 0`** — `stock-service.ts:152`. Com venda sem estoque permitida (saldo negativo) + entrada, a fórmula do custo médio ponderado produz custo negativo/distorcido. Correção: quando `saldoAntes <= 0`, usar o custo da entrada como novo custo médio.

### Financeiro
10. **Cadastrar recebível avulso quebra (FK inválida)** — `FinanceManager.tsx:247` envia `clienteId: "MANUAL"` (placeholder); `createReceivable` (`finance-use-cases.ts:363`) não valida e o insert viola a FK de `Cliente`. **✅ CONFIRMADO no teste E2E** (erro `Invalid tx.contaReceber.create()`). **Na prática não dá para cadastrar recebível manual hoje.** Correção: seletor de cliente cadastrado + validar pertencimento ao tenant. *(Alinha com a melhoria de Contas a receber que você já pediu para amanhã.)*
11. **Lançar gasto no financeiro não debita nenhuma conta** — `gasto-use-cases.ts:218`. `lancarGastoNoFinanceiro` chama `settlePayable` sem `contaBancariaId`; o saldo da conta e o fluxo de caixa não reduzem — o gasto "evapora". Correção: escolher a conta no lançamento e propagar ao `settlePayable`.

### Segurança / Multi-tenant
12. **Loja pública confia no `precoUnitario` enviado pelo navegador** — `sale-use-cases.ts:83-95` / `quote-use-cases.ts:78`. A rota pública repassa o preço do cliente sem reler `Produto.precoVenda` — dá para forjar pedido com preço 0. Correção: recalcular preço no servidor a partir do produto.
13. **Loja pública aceita `produtoId` de outro tenant/inexistente** — `sale-use-cases.ts:72-91`. No caminho da loja não há o guard de pertencimento que existe na edição; um ID estranho entra no pedido. Correção: validar que todo `produtoId` pertence ao scope e é `visivelEcommerce`.
14. **RBAC por módulo não é aplicado na maioria das APIs ERP** — só ~23 de 100+ rotas usam `requireModulo`/`requireAdmin`. Um usuário autenticado de perfil restrito pode chamar diretamente (ex.) `PUT /api/erp/configuracoes/ia` e gravar a chave OpenRouter. O isolamento ENTRE tenants é mantido; a autorização DENTRO do tenant é contornável via API. Correção: `requireModulo`/`requireAdmin` em cada handler ERP (wrapper comum).

---

## 🟡 Atenção (corrigir cedo)

- **Nota AUTORIZADA mas pedido não atualizado** — `sale-use-cases.ts:583-620`. Sem guard de "já existe nota autorizada" no início de `invoiceSale`, reemissão pode duplicar nota.
- **Sem idempotência de emissão / polling curto (15s)** — `acbr-provider.ts:508-518`. Timeout com SEFAZ autorizando deixa nota local em ERRO/PROCESSANDO; sem reconciliação automática.
- **ICMS-ST por MVA não destacado no item** — `acbr-provider.ts` (icmsGroup só cobre 00/60/90/SN). Contribuinte substituto não emite corretamente (`vST ≠ sum(item ST)`).
- **Alíquota interestadual ignora produto importado (4%)** — `national-tax-baseline.ts:83-87`.
- **Faturamento de OS com TOCTOU** — `service-order-use-cases.ts:347`. Guard de status fora da transação → dupla `ContaReceber` + dupla baixa em concorrência. Vencimento fixo +30d ignora a condição de pagamento.
- **Forma de pagamento no Contas a pagar é só rótulo** — `settlePayable` não captura qual cartão/máquina, à vista/parcelado, parcelas. *(É exatamente a melhoria que você pediu para amanhã.)*
- **Conta bancária opcional na baixa** — permite "quitar" sem mexer no saldo (divergência silenciosa).
- **"Boleto" fantasma** — `FinanceManager.tsx:538`: botão "Boleto" em toda linha sem `onClick` e forma "BOLETO" sem geração. Remover até existir integração.
- **Sangria sem validar saldo do caixa** — `cashier-use-cases.ts:275-294` (permite esperado negativo).
- **Troco fora do dinheiro** — `cashier-use-cases.ts:215-222`: cartão "com troco" sem dinheiro suficiente soma a mais.
- **`getClienteConsumidorPadrao` sem `empresaId`** — `cashier-use-cases.ts:41-53`: pode reaproveitar consumidor de outra empresa do mesmo tenant.
- **Inventário fotografa saldo na abertura** — `inventory-use-cases.ts:144`: movimentações concorrentes geram ajuste errado; sem cancelar/reabrir inventário.
- **Recebimento de compra sem limite** — `purchase-use-cases.ts:172`: recebe mais que o pedido sem trava.
- **GTIN duplicado aceito** — `schema.prisma:857` (só índice, sem unique) + cadastro sem validação → match por GTIN pega arbitrário.
- **Gating de tenant é fail-open** — `tenant-features.ts:35-45`: erro de leitura libera tudo (ruim para módulos pagos).
- **`assertModuloLiberado` raramente nas APIs** — flag de tenant checada só em páginas/menu.

## 🟢 Melhorias (qualidade / pós-piloto)

- IBPT por NCM (hoje usa soma dos impostos calculados); cTribNac da NFS-e é heurístico; enviar GTIN real no XML quando válido; resolver IBGE no cadastro, não na emissão.
- Estorno de baixa no financeiro não existe (a própria mensagem de erro o cita); padronizar `formaPagamentoId` (FK) em vez de texto livre.
- UX: sangria/suprimento via `window.prompt` no caixa; mensagens de erro do provedor ACBr cruas; rate-limit no login + rotação de sessão; key-id no ciphertext para rotação de chave.
- Validar preço de venda vs custo/mínimo; NCM/unidade contra tabela; cota própria de Cosmos/IA por empresa.
- Renomear `getDevelopmentTenantScope` → `getRequestScope` (hoje é seguro, mas o nome engana).

---

## Confirmações empíricas (teste E2E como usuário)

| # | Cenário | Resultado |
|---|---------|-----------|
| 1 | Abrir caixa | ✅ OK |
| 2 | Venda balcão baixa estoque (createSale + confirmSale) | ✅ OK (11→9, status AGUARDANDO_NOTA) |
| 3 | Cancelar venda em AGUARDANDO_NOTA repõe estoque | ❌ **BUG** (ficou 9, deveria voltar a 11) |
| 4 | Cadastrar recebível avulso (clienteId "MANUAL") | ❌ **BUG** (viola FK de Cliente) |
| 5 | Lançar gasto no financeiro debita conta | ⚠️ não rodou (módulo Gastos estava desligado para a empresa — o gate funcionou); bug confirmado pela auditoria de código |

> Observação: o módulo **Gastos** estava desligado no painel do dono do SaaS para a VALLETECLAB — o bloqueio por flag funcionou corretamente (efeito colateral do teste de módulos). Dados de teste foram limpos e o estoque restaurado ao final.

## Pontos sólidos confirmados
- Isolamento entre tenants: queries escopadas por `tenant/empresa`; sessão real; admin protegido por `requirePlatformAdmin`.
- Criptografia AES-256-GCM de segredos (certificado/OpenRouter/Z-API/Cosmos); segredos mascarados nas respostas.
- `setTenantModulo` valida flag contra whitelist; loja respeita `lojaHabilitada` e só expõe produtos `visivelEcommerce`.
- Motor fiscal estruturado (CFOP por operação, grupos por CST, gate SPED, reforma IBS/CBS preparada).

## Próximos passos recomendados (ordem)
1. **Estoque/Caixa/Financeiro** (bloqueadores 1, 2, 3, 8, 9, 10, 11) — corrompem dados operacionais.
2. **Fiscal** (4, 5, 6, 7) — rejeição direta da SEFAZ.
3. **Segurança** (12, 13, 14) — antes de expor a loja pública.
4. Itens de Atenção; depois Melhorias.

> Sinergia com a agenda de amanhã (Contas a pagar/receber): os bloqueadores 10/11 + "forma de pagamento detalhada" + "boleto fantasma" já entram nesse pacote.

---

## Atualização 2026-06-12 — correções aplicadas (mesma data)

Os bloqueadores e a maioria dos itens de Atenção foram corrigidos por agentes especializados (cada um com propriedade exclusiva de arquivos), com `tsc`/`build` limpos e re-teste E2E confirmando.

**Bloqueadores corrigidos (1-14):**
1. ✅ Cancelar venda em status pós-confirmação (AGUARDANDO_NOTA/SEPARACAO/ENVIADO/ENTREGUE) agora repõe estoque (estorno por ENTRADA). **Re-teste E2E: 11→9→11.**
2. ✅ PDV: revalida caixa antes de registrar e, se o recebimento falhar após a emissão, não perde a venda — retorna `avisoRecebimento` explícito (dinheiro a lançar manualmente).
3. ✅ Caixa: helper `assertCaixaAbertoTx` revalida `status=ABERTO` dentro das transações de recebimento e fechamento.
4. ✅ `dhEmi` agora usa `fiscalDateTimeSaoPaulo()` (offset -03:00).
5. ✅ Desconto por item: `vNF`/`ICMSTot.vDesc` = descontos de item + documento, coerentes (emit + preview).
6. ✅ `tPag=99` envia `xPag`.
7. ⏳ Devolução espelhar tributos: deixado TODO documentado com caminho de implementação (mudança grande, não feita pela metade).
8. ✅ Entrada fiscal só processa em `AGUARDANDO_CONFERENCIA`/`CONFERIDA` (barra ESTORNADA/PROCESSADA).
9. ✅ Custo médio reinicia com o custo da entrada quando `saldoAntes<=0`.
10. ✅ Recebível avulso: seletor de cliente cadastrado + validação de pertencimento ao tenant. **Re-teste E2E: cliente inválido barrado; cliente real funciona.**
11. ✅ Lançar gasto debita conta bancária (default = primeira conta ativa) via `settlePayable`.
12. ✅ Loja recalcula `precoUnitario` do banco (ignora o do cliente).
13. ✅ Loja valida `produtoId` por scope + `visivelEcommerce`.
14. ✅ RBAC: 33 handlers de `configuracoes/**` agora exigem `requireModulo`/`requireAdmin` (segredos→admin); helper `authErrorStatus` (401/403). Lista priorizada das demais rotas ERP registrada para o próximo passo.

**Atenção corrigidos:** guard de nota duplicada em `invoiceSale`; consumidor padrão por empresa; sangria valida saldo; troco só do dinheiro em todas as formas; OS faturamento com trava otimista + vencimento pela condição de pagamento; conta bancária obrigatória na baixa; inventário recalcula contra saldo atual + `cancelInventory`; recebimento de compra com limite; alíquota 4% para importado interestadual.

**Pendências (próximo passo):** devolução espelhar tributos (item 7); ICMS-ST por MVA no XML; `requireModulo` nas demais rotas ERP (lista no relatório do agente); UI do PDV exibir `avisoRecebimento`; rota para `cancelInventory`; forma de pagamento detalhada no contas a pagar (agenda 13/06).

### Validação fiscal ao vivo na SEFAZ (homologação) — 2026-06-12
Ciclo completo emitido e autorizado, fechando o fix #5 (desconto por item):
- **NFC-e com desconto por item AUTORIZADA** (nº 29) — totais coerentes `vProd 259,80 − vDesc 30,00 = vNF 229,80` (cenário que antes era rejeitado por `vProd-vDesc ≠ vNF`).
- `dhEmi −03:00` exercitado (toda emissão) — autorizado.
- Cancelamento da NFC-e → CANCELADA, com **estoque reposto 33→33** (valida o fix do cancelamento com nota real). 
- (O usuário já havia validado anteriormente a emissão de NF-e, NFC-e e NFS-e.)
