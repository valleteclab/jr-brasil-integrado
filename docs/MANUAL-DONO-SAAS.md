# Manual do Dono do SaaS — XERP

> Guia de operação da plataforma para o administrador (Valleteclab). Tudo aqui é feito pelo
> painel **/admin** — nada exige mexer em código. Atualizado em jul/2026.

---

## 1. Os planos e o que cada um liga

Menu **/admin → Planos & preços**. Cada plano tem: **mensalidade**, **limite de notas/mês**
(vazio = ilimitado), **IA/mês** (vazio = ilimitada; 0 = sem IA) e **trial (dias)** — tudo editável.

| Plano | O que o cliente tem | Preço padrão |
|---|---|---|
| **COMPLETO** | ERP inteiro (PDV, estoque, financeiro, fiscal, OS, IA…) | definido por você |
| **EMISSOR** | Só emissão NF-e/NFS-e + clientes/produtos (MEI e Simples) | R$ 99,90 · 20 notas |
| **CHAT** | Emissor + **assistente de IA** (Telegram/WhatsApp/web) + gastos por foto | R$ 97 · 400 IA/mês |

- Ao mudar o **preço** de um plano, aparece a opção **"Aplicar aos assinantes atuais"** —
  marcada, reajusta as assinaturas ativas no Asaas (quem tem desconto individual mantém o desconto).
- Trocar o plano de um cliente: **/admin/clientes/[cliente] → card "Plano"** (botões Completo /
  Emissor / Chat). A troca aplica o preset de módulos; os toggles individuais continuam valendo depois.

## 2. Ciclo de vida do cliente (venda automatizada)

1. **Entrada**: o cliente se cadastra sozinho em **/cadastro** (CNPJ primeiro — os dados vêm da
   Receita) e cai no plano Emissor com trial. Ou você cria em /admin → Novo cliente.
2. **Trial**: no card do cliente você estende (+7/+15/+30 dias), define uma **data exata** no
   calendário, ou **remove o trial** (= liberar grátis, SEM cobrança — cuidado!).
3. **Cobrança**: no card, defina o **valor da mensalidade** (vazio = preço do plano; preenchido =
   desconto/acordo daquele cliente), escolha o **1º vencimento** (define o dia de TODOS os meses)
   e clique **💳 Gerar cobrança**. Copie o link da fatura e envie — ou use a página Cobranças (abaixo).
4. **Pagamento**: o webhook do Asaas confirma sozinho e libera o acesso.
5. **Inadimplência (automática)**: fatura vencida → **3 dias** de atraso = banner + sino no sistema
   do cliente com link de pagamento; **7 dias** = tela de bloqueio "Mensalidade em atraso" com botão
   Pagar. Pagou → desbloqueia na hora. Você não precisa fazer nada.

## 3. Página Cobranças (💰 no menu do admin)

O centro financeiro do SaaS:
- Cada cliente com assinatura: badges **pagas / pendentes / vencidas** (ao vivo do Asaas) e a
  lista de faturas (vencimento, valor, status, link).
- **🧾 NFS-e da mensalidade**: emite a nota pela SUA empresa (Valleteclab) com o cliente como
  tomador. Escolha a **fatura correspondente** (cria o vínculo e trava duplicidade) e o **código
  de serviço** no select (para SaaS: **010501 — Licenciamento**). O PDF (DANFSE) sai na hora.
- Coluna **NFS-e** nas faturas: mostra a nota vinculada (badge + PDF) ou permite **vincular** uma
  nota já emitida.
- **✉ Enviar cobrança**: e-mail pelo seu SMTP (@valleteclab.com.br) com o botão "Pagar fatura" e a
  NFS-e em PDF anexa. O campo "Para" vem com o e-mail do cliente (aceita vários, separados por vírgula).

## 4. Assistente de IA (o diferencial)

### O que ele faz (Telegram, WhatsApp, chat web e MCP)
Consultas (produto, estoque, cliente, pedido, OS, relatórios, dashboard), **cadastrar cliente pelo
chat** (só o CNPJ — dados vêm da Receita), criar orçamento/pré-venda, confirmar pedido, **emitir
NF-e/NFC-e/NFS-e**, boleto, Pix (QR na conversa), cancelar boleto/nota, consulta de crédito
(bureau), enviar documentos ao cliente, e **foto de cupom → gasto lançado** (WhatsApp).
Ações irreversíveis exigem confirmação (EMITIR/CANCELAR) — sempre.

### Como um cliente ativa
1. **Telefones autorizados**: no ERP do cliente → Configurações → IA → Telefones do agente
   (papel GESTOR emite/cobra; VENDEDOR só cria rascunhos).
2. **Telegram**: o cliente configura o bot (token do BotFather) em Configurações → IA; o usuário
   compartilha o contato no chat e está identificado.
3. **WhatsApp**: instância Z-API em Configurações → WhatsApp.

### Multi-empresa (o recurso do CONTADOR)
O **mesmo telefone** pode ser autorizado em **várias empresas**. No chat, o assistente pergunta
**"qual empresa você quer acessar?"** (lista numerada com CNPJ), fixa a escolha e mostra a empresa
ativa em toda resposta (🏢). **"trocar empresa"** alterna. Segurança: a empresa ativa só pode ser
uma das que o telefone está cadastrado — cliente A nunca alcança dados do B.

### Franquia de IA (proteção de custo)
Definida por plano em /admin/planos (**IA/mês**). Cada mensagem processada pela IA (e cada foto de
cupom) consome 1. Acabou → o assistente avisa e os **fluxos de botão continuam ilimitados**.
MCP não consome (o LLM é do cliente).

## 5. Emissão fiscal — o que você controla

- **Provedor fiscal global**: /admin → Provedor fiscal (SEFAZ direto para NF-e; NFS-e roteia
  automático pelo Nacional). O cliente só configura ambiente + certificado A1.
- **Status dos serviços**: /admin → Status dos serviços (saúde de SEFAZ/SEFIN/provedores).
- **Emissões**: /admin → Emissões fiscais (tudo que os clientes emitem).
- **DANFSE próprio**: se a API de PDF do governo (ADN) cair/for desativada, o sistema gera o
  DANFSE sozinho (leiaute idêntico ao oficial) — automático, nada a fazer.

## 6. Reforma Tributária (📜 no menu)

A página **/admin/reforma** mostra: prontidão do sistema (notas de produção com IBS/CBS),
calendário 2026→2033 e as **fontes oficiais monitoradas** (NTs da NF-e, leiautes da NFS-e).
O robô vigia 1×/dia — documento novo → aviso no seu sino. Botão "Verificar agora" força a checagem.
Detalhes técnicos: `docs/REFORMA-ROADMAP.md`.

## 7. Crédito & bureau (💳)

- /admin → Crédito & bureau: chave do **Asaas** (produção!), webhook (botão "Registrar webhook" —
  eventos: pagamento recebido/confirmado, vencido, removido, estornado), preços de revenda das
  consultas e liberação de créditos cortesia.
- Os clientes recarregam créditos por Pix e consultam CPF/CNPJ (score/restrições) — você revende.

## 8. Infra e deploy (para quem mantém)

- Fluxo: desenvolver local → `git push` → `./deploy/vps.sh deploy`. O deploy é **sem downtime**
  (o container novo sobe, fica saudável e só então o antigo sai; versão ruim volta sozinha).
- **Regra de ouro das migrations**: sempre aditivas (nunca DROP/RENAME em uso).
- Monitoramento externo: `GET /api/health` (200 ok; 503 = banco fora).
- Fuso do sistema: America/Sao_Paulo (container); banco grava em UTC.

## 9. Checklist do dia a dia (5 minutos)

- [ ] **Sino** do admin: novidades da Reforma? Alertas críticos?
- [ ] **/admin/cobrancas**: alguma fatura vencida? (a régua automática já avisa o cliente,
      mas vale acompanhar quem está a 1–2 dias do bloqueio)
- [ ] **/admin/clientes**: trials perto de vencer → vale um contato de venda
- [ ] Virada de mês: emitir as **NFS-e das mensalidades** (Cobranças → 🧾 por cliente) e enviar
      junto com as faturas (✉)

## 10. O que exige ação sua quando acontecer

| Evento | O que fazer |
|---|---|
| Sino: "Novidade fiscal — Portal NF-e/NFS-e" | Abrir a fonte, avaliar; se for NT nova, planejar com o dev (runbook) |
| Sino: "Nota de produção SEM grupo IBS/CBS" | Crítico — chamar o dev no mesmo dia |
| Cliente pediu desconto | Card do cliente → Valor da mensalidade (atualiza a assinatura na hora) |
| Cliente quer mudar dia de vencimento | Card → 1º vencimento + Gerar cobrança (atualiza o ciclo) |
| Certificado A1 de cliente vencendo | O sistema avisa o cliente sozinho (sino, ≤30 dias) |
| Trocar preço de um plano | /admin/planos (decidir se aplica aos assinantes atuais) |
