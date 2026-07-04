# Plano de melhorias de fluxos — XERP

Levantamento de 2026-07-04, varrendo todos os módulos do sistema (fiscal, financeiro/bancário,
comercial/PDV, estoque/produtos/compras, OS/oficina/equipe, config/admin/IA). **É um plano — nada
foi implementado.** Prioridade: 🔴 crítico (risco de erro operacional/fiscal) · 🟡 alto (atrito real
no dia a dia) · 🟢 melhoria (conveniência/relatório). Muitos itens se repetem entre módulos — os
temas transversais estão no fim, e valem para tudo.

> O sistema é sólido e os fluxos estão bem encadeados. Estes pontos são de **UX/produtividade e
> proteção contra erro** — quase nenhum é bloqueador.

---

## Temas transversais (maior alavanca — resolvem dezenas de itens de uma vez)

1. 🔴 **Validação em tempo real nos formulários** — CPF/CNPJ (dígito verificador), CEP, e-mail,
   telefone, NCM/CEST (contra tabela oficial), chave Pix, código LC116, saldo devedor máximo na
   baixa. Hoje a maioria só falha no submit ou depois, na SEFAZ/banco. Padronizar validação on-blur
   com ✓/✗ e mensagem clara.
2. 🔴 **Confirmação em ações destrutivas/irreversíveis** — bloquear cliente/empresa, desativar
   módulo/2FA, trocar provedor fiscal, resetar senha, finalizar inventário, estornar baixa. Modal
   explicando o impacto ("todos os usuários serão desconectados", "X itens serão ajustados").
3. 🟡 **Busca, filtro por período e paginação** — recorrente em: contas a pagar/receber, emissões
   (admin), usuários, técnicos, colaboradores, inventário, relatórios. Bases grandes ficam lentas e
   sem como achar o registro. Padronizar toolbar de filtros + paginação/scroll.
4. 🟡 **Log de auditoria visível na UI** — "última alteração por X em DD/MM", "último acesso",
   "último teste de conexão". Os dados já são gravados em audit log; falta expô-los (senha, módulos,
   regras tributárias, provedor fiscal, cliente/status).
5. 🟡 **Exportar (PDF/CSV/Excel)** — relatórios gerenciais, conciliação, fluxo de caixa, gastos. Hoje
   os dados ficam presos na tela; o contador/gerente precisa levar para fora.
6. 🟡 **Feedback de operações assíncronas** — sincronização SEFAZ/SEFIN sem "última sync há Xh" +
   botão "sincronizar agora"; emissão fiscal/Pix/boleto sem estado claro em erro (limbo). Mostrar
   timestamp, status e ação de retry.
7. 🟢 **Desconto: alternar R$ / %** — em vendas, OS e caixa o desconto é em R$, mas o usuário digita
   esperando %. Toggle R$/% com prévia do valor final.

---

## Fiscal

### Documentos fiscais (NF-e / NFC-e / NFS-e)
- 🔴 **Certificado A1 vencido falha silenciosamente** — nota vai a ERRO sem dizer que é o certificado.
  Validar validade antes de emitir e avisar no dashboard se faltar < 30 dias.
- 🔴 **Devolução sem validação de quantidade** — permite devolver mais do que foi emitido. Limitar ao
  máximo devolvível por item na UI e no back.
- 🟡 **Espelho fiscal é modal secundário** — tornar a revisão obrigatória antes de emitir (confirmar
  "revisei os impostos"); e sinalizar valores da Reforma (IBS/CBS/IS) como "informativo (NT)".
- 🟡 **Erro de CFOP/rejeição da SEFAZ deixa a nota em ERRO sem correção guiada** — exibir o erro,
  sugerir CFOPs válidos para o NCM e permitir reemitir sem refazer tudo.
- 🟢 **Motivos de cancelamento sem sugestões** — lista de motivos comuns + campo livre.
- 🟢 **Onboarding fiscal inicial** — wizard obrigatório na 1ª vez em /erp/fiscal (certificado → testar
  → 1ª emissão), e diagnóstico passo-a-passo no "Testar conexão" (conectar/autenticar/emitir/PDF).

### Entradas fiscais (notas recebidas)
- 🔴 **Processamento "tudo ou nada"** — um item com problema trava a nota inteira. Processar
  item-a-item, salvar os OK, listar erros e permitir retry.
- 🟡 **Match de produto e finalidade sem indicar confiança nem origem** — mostrar "REVENDA (regra
  De/Para X)" / "por NCM" / "IA (baixa confiança)" e permitir override rápido no review.
- 🟡 **Fator de conversão sem sanidade** — avisar se fator > 100 ou < 0,01; sugerir o da última compra.
- 🟡 **Sincronização (DF-e/NFS-e) opaca** — expor "última sync há Xh" + "sincronizar agora".
- 🟢 **Estorno de entrada não reverte créditos de imposto** — tornar o estorno transacional completo.

### Regras tributárias / de finalidade
- 🔴 **Sem regra → usa DEFAULT silencioso** — avisar "sem regra específica para NCM X, usando padrão"
  ou bloquear até criar; validar vigência (não aplicar regra expirada).
- 🟡 **Não mostra qual regra foi aplicada** na emissão/entrada — exibir nome da regra + CST/alíquota no
  espelho e no review de entrada.
- 🟡 **Prioridade numérica invertida** (maior = menos prioritário) nas regras de finalidade — inverter
  ou trocar por arrastar-ordenar.
- 🟢 **Sem import CSV em massa** de regras (migração de empresa nova) e sem detecção de duplicata.

### SPED Fiscal
- 🟡 **Geração é caixa-preta** — log por bloco (0/1/E/G/9) e avisos de inconsistência **clicáveis**
  (link para a nota problema).
- 🟢 **CIAP**: validar bem duplicado; recalcular fator de saídas tributadas no fechamento do ano.

---

## Financeiro / Bancário

### Contas a pagar / receber
- 🔴 **Estorno desfaz TODAS as baixas** — mesmo em datas diferentes. Permitir estorno parcial / por
  baixa.
- 🟡 **Conta bancária obrigatória na baixa sem aviso prévio** — validar antes de abrir o form; e
  validar valor pago ≤ saldo em tempo real (com o saldo máximo à vista).
- 🟢 **Cartão parcelado sem preview** de "3x de R$ X" antes de confirmar; **saldo vencido** sem
  destaque em vermelho.

### Caixa / PDV
- 🔴 **Múltiplas formas de pagamento sem validar a soma = total** — bloquear "Finalizar" enquanto pago
  ≠ total.
- 🔴 **Emissão fiscal falha deixa a venda em limbo** — mostrar erro com "Reemitir" / "Reverter venda".
- 🟡 **Boleto no PDV sem preview de parcelas/vencimentos** antes de gerar.
- 🟡 **Diferença de caixa no fechamento sem aprovação** — acima de um limite, exigir OK de gerente.
- 🟢 **QR Pix sem tempo de validade visível**; **desconto à vista por forma** (ex.: 5% dinheiro).

### Conciliação bancária (extrato)
- 🟡 **Casamento só por valor+data** — dois lançamentos iguais confundem. Usar também a descrição
  (fuzzy) e destacar antecipação automaticamente.
- 🟡 **Diferença de saldo sem pista de causa** — checklist automático (cheques a compensar, DOC em
  trânsito).
- 🟢 **Extrato Sicoob limitado a ~90 dias** — cache persistente para consulta histórica. (Extrato
  unificado multibanco = Open Finance, ver [docs de integração].)

### Fluxo de caixa / Gastos / Antecipação
- 🟡 **Fluxo de caixa** não exclui contas canceladas; sem exportar; contas sem vencimento somem.
- 🟡 **Antecipação só aceita taxa em R$** — oferecer modo %; permitir "desfazer antecipação".
- 🟡 **Gastos (IA de cupom)**: permitir "aceitar com correções"; escolher a conta ao lançar (hoje vai
  na padrão sem avisar); categoria por dropdown (não texto livre).
- 🟢 **Gastos**: relatório por categoria/fornecedor; migrar imagem base64 → storage.

### Configuração de contas / cobrança
- 🟡 **Saldo inicial não editável** após criar — permitir ajuste com movimento auditado.
- 🟡 **Certificado A1 exigido em produção sem aviso** ao configurar cobrança.
- 🟢 **Validar chave Pix / formato de client_id** antes de salvar; nunca deletar conta (só desativar).

---

## Comercial / Vendas

### Atendimento / Vendas
- 🔴 **Tabela de preço por cliente não é aplicada** — carregar `tabelaPrecoId` do cliente e sugerir na
  venda/orçamento.
- 🟡 **Senha de admin para desconto pedida toda vez** — cache por sessão (ex.: 15 min).
- 🟡 **Sem aviso de estoque insuficiente ao adicionar item** — alertar e oferecer "marcar como pedido".
- 🟡 **Condição de pagamento sumiu da UI** (existe no banco) — reexpor com sugestões (30/60/90).
- 🟢 **Botão "Importar lista" não faz nada** — implementar (CSV) ou remover; **não redirecionar** após
  criar (oferecer "abrir outra"); **carregar itens de venda anterior**.

### Orçamentos
- 🟡 **Expirados não alertam** — badge "⚠ expirou em DD/MM" na lista; botão "Renovar".
- 🟢 **Conversão é tudo-ou-nada** (permitir converter/editar itens); sem versionamento nem thread de
  mensagens com o cliente.

### Expedição
- 🟡 **Sem autenticação do conferente** e **sem histórico "entregue hoje"** — quem entregou o quê.
- 🟢 **Código de retirada de 6 caracteres** — aumentar/adicionar dígito verificador; destacar
  nome/foto do cliente antes de confirmar.

### Clientes / Fornecedores
- 🟡 **Cliente criado na loja fica "pendente" e some do balcão** — filtro "mostrar pendentes" ou
  auto-aprovar documento válido; **sem checagem de CPF/CNPJ duplicado**.
- 🟡 **Limite de crédito não mostra o utilizado** — badge "limite / usado / disponível".
- 🟢 **Fornecedor com cadastro raso** (falta IE, endereço, contatos, dados bancários); sem histórico
  de compras nem classificação.

### Loja / Devolução
- 🟢 **Loja**: carrinho não persiste; sem estoque em tempo real; sem pagamento online; sem
  rastreamento público do pedido.
- 🟡 **Devolução não tem "troca"** (devolver + vender em 1 passo) nem controle de "reembolso pendente";
  motivo em texto livre (sem categorização).

---

## Estoque / Produtos / Compras

### Produtos
- 🔴 **Fator de conversão de embalagem não valida > 0** — produto fica quebrado para compra/estoque.
- 🟡 **CFOP derivado sobrescreve o digitado manualmente** ao trocar CST — preservar CFOP especial.
- 🟡 **NCM sugerido por IA sem validar contra tabela oficial** — risco de rejeição.
- 🟢 **Sem aviso ao descartar alterações** no drawer; imagem > 1,5 MB rejeitada sem sugerir compressão.

### Estoque / Inventário
- 🔴 **Vários inventários abertos no mesmo depósito** — bloquear novo enquanto houver um em contagem.
- 🟡 **Finalizar inventário aplica ajustes sem revisão** — mostrar resumo ("vai ajustar 12 itens") e
  permitir desmarcar; **transferência sem validar saldo** suficiente.
- 🟢 **Motivo de ajuste em texto livre** — dropdown padrão (perda/ganho/defeito/divergência);
  transferência recarrega a página (atualizar estado local); paginar inventário > 200 itens.

### Compras
- 🔴 **Quantidade obrigatoriamente inteira** — impede comprar por peso/volume (kg, L). Aceitar decimal.
- 🟡 **Sem gerar conta a pagar ao receber** (checkbox "gerar título, venc. +30d") e **sem vínculo com a
  NF-e de entrada**.
- 🟡 **Fator de conversão / quantidade mínima sem validação**; custo não vem do último se lastCost=0.
- 🟢 **Recebimento parcial sem lista de pendentes**; sem alerta de pedido atrasado (previsão vencida).

---

## Ordem de Serviço / Oficina / Equipe

### Ordem de serviço
- 🔴 **Peça "a comprar" sem notificação proativa quando chega** — hoje é lista visual + marcação
  manual. Ao importar a NF de entrada que casa, notificar (chat/browser) e destacar na OS.
- 🟡 **Desconto da OS em R$ (não %)**; **serviço/peça sem editar** (só remover+readicionar); **LC116
  sem validação** até faturar.
- 🟡 **Reemitir nota após falha não é óbvio** — banner "❌ nota rejeitada" + botão "Reemitir" inline.
- 🟢 **Peça em estoque reserva mesmo sem confirmar** — mostrar saldo ao adicionar; **"abrir OS rápida"**
  (só cliente+equipamento); apontamento automático ao iniciar ("iniciado por X").

### Painel da oficina (TV)
- 🟡 **Cartões são só leitura** — torná-los clicáveis (iniciar/finalizar/atualizar) para tablet/touch.
- 🟢 **Sem filtro** (oficina grande vira scroll infinito); sem som/animação de nova OS; sem KPIs do dia
  (tempo médio, produtividade por técnico); problema truncado sem ver completo.

### Técnicos / Colaboradores / Comunicação
- 🟡 **RBAC é tudo-ou-nada por módulo** — sub-ações (ver × editar × faturar × excluir); **deletar
  perfil em uso** sem bloqueio; **senha temporária mostrada 1x** (enviar por e-mail se SMTP ok).
- 🟢 **Sem filtro Ativos/Inativos** em técnicos/colaboradores; **envio ao cliente (e-mail/WhatsApp) sem
  preview nem histórico de envios**; especialidade do técnico em texto livre.

---

## Configurações / Admin / IA

### Login / Conta / Empresa
- 🔴 **Ativar 2FA sem validar que os usuários têm WhatsApp** — login quebra para quem não tem. Listar
  quem está sem WhatsApp e bloquear/avisar; permitir exceção por usuário.
- 🟡 **Desafio 2FA expira entre telas sem explicar**; sem limite de tentativas de código.
- 🟢 **Troca de senha**: força visual, ver/esconder, "última alteração", aviso de logout das outras
  sessões; **CNPJ/CEP sem validação**; lookup que falha silencioso.

### Admin (plataforma)
- 🔴 **Provedor fiscal**: validar credencial (e simular emissão de teste) **antes** de salvar; avisar do
  impacto ao trocar de provedor ("todas as empresas serão afetadas").
- 🟡 **Perfil pode dar acesso a módulo desabilitado no tenant** — bloquear/avisar; **filtros de
  emissões/usuários não persistem na URL** e faltam busca/paginação/período.
- 🟢 **KPIs do admin sem tendência (▲/▼) nem período**; slug/senha inicial sem validação de
  força/unicidade; sem log de ativação de módulo.

### Relatórios / Assistente IA
- 🟡 **Relatórios**: período fixo em 30d (adicionar seletor e comparação com período anterior);
  drill-down (clicar no KPI filtra a tabela); exportar; paginar tabelas grandes.
- 🟢 **Assistente IA**: mostrar erro/timeout; "limpar conversa"; badge "✓ salvo"; feedback se o draft
  falhou; prompts por empresa (futuro).

---

## Sugestão de sequência (ondas)

**Onda 1 — proteção contra erro (baixo esforço, alto valor):**
bloquear "Finalizar" no caixa se soma ≠ total · validar fator de conversão > 0 · impedir inventário
duplicado · aceitar quantidade decimal na compra · avisar antes de ações destrutivas · validar A1
vencido antes de emitir · validar credencial do provedor antes de salvar.

**Onda 2 — atrito diário:**
filtros+período+paginação padronizados · desconto R$/% · cache da senha de admin · tabela de preço por
cliente · gerar conta a pagar ao receber compra · "última sync + sincronizar agora" · badge de crédito
usado do cliente.

**Onda 3 — visibilidade e relatórios:**
exportar relatórios/conciliação · logs de auditoria na UI · qual regra tributária/finalidade foi
aplicada · drill-down e comparação de período · preview de e-mail/WhatsApp + histórico de envios.

**Onda 4 — evolução de produto:**
RBAC granular (sub-ações) · painel da oficina interativo · troca/reembolso na devolução · versionamento
de orçamento · loja com estoque/pagamento/rastreamento · Open Finance para conciliação multibanco.
