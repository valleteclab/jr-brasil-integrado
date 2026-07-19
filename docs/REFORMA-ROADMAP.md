# Reforma Tributária (IBS/CBS/IS) — Roadmap do XERP

> Documento VIVO. Atualize a cada Nota Técnica/leiaute novo e a cada entrega no sistema.
> Regra da casa: **só mexemos em código quando sai documento técnico oficial** (NT, leiaute,
> ato do CG-IBS) — nunca por notícia/rumor. Toda mudança de leiaute segue o
> [RUNBOOK-LEIAUTE-FISCAL](./RUNBOOK-LEIAUTE-FISCAL.md).

## Status atual do sistema (o que JÁ está pronto)

| Item | Status |
|---|---|
| NF-e (55) com grupo `IBSCBS` + `IBSCBSTot` (NT da RTC) | ✅ Em produção, validado (XSD oficial + cStat 100) |
| NFC-e (65) com destaque IBS/CBS | ✅ Mesmo motor/builder da NF-e |
| Motor de tributos com `cClassTrib` (classificação tributária) | ✅ |
| Gate por data (destaque liga a partir de 2026-01-01) | ✅ |
| NFS-e nacional com grupo IBS/CBS | ⏳ **Leiautes JÁ PUBLICADOS** (NT SE/CGNFS-e 009, `RN_RTC_IBSCBS v1.04`, AnexoVIII correlação Item de Serviço×NBS×cClassTrib — página RTC da NFS-e). Implementar quando aplicável ao DPS dos nossos emissores |
| Monitor automático de fontes oficiais + auto-check de prontidão | ✅ Cron `/api/cron/reforma` (ver abaixo) |

## Calendário da transição (EC 132/2023 + LC 214/2025)

| Ano | O que muda | Impacto no XERP |
|---|---|---|
| **2026** | Ano-teste: destaque INFORMATIVO de IBS (0,1%) + CBS (0,9%) nos documentos fiscais; quem destaca corretamente fica dispensado do recolhimento | ✅ Feito na NF-e/NFC-e. Pendente: NFS-e quando o leiaute nacional sair |
| **2027** | **CBS pra valer** (extingue PIS/COFINS), Imposto Seletivo (IS) entra, IPI zerado (exceto ZFM), IBS 0,1%; **split payment começa (piloto)** | 🔴 MAIOR ENTREGA: gate 2027 no motor (desligar PIS/COFINS, alíquotas reais de CBS por cClassTrib, IS p/ produtos sujeitos). Financeiro: preparar conciliação bruto × líquido (split) |
| **2029–2032** | Transição gradual ICMS/ISS → IBS (redução de 1/10 por ano nas alíquotas de ICMS/ISS) | Regras por UF/município mudam ano a ano — via tabela de regras, não código |
| **2033** | Sistema pleno: ICMS e ISS extintos | Motor só IBS/CBS/IS |

## Split payment — o que (não) fazer agora

- Quem EXECUTA o split são os **arranjos de pagamento** (bancos, adquirentes, PSPs — Sicoob,
  Asaas etc.) na liquidação, sob regras do CG-IBS. O ERP não recolhe.
- Impacto no XERP é **financeiro**: recebimentos chegarão líquidos de tributo → conciliação,
  baixa de títulos e fluxo de caixa precisarão tratar **bruto × líquido do tributo**.
- **Sem regulamentação operacional final** → implementar agora = retrabalho garantido.
  Ação: acompanhar atos do CG-IBS; desenhar quando o manual operacional sair.

## Fontes oficiais monitoradas

O cron **`/api/cron/reforma`** (roda 1×/dia de carona no cron de boletos) vigia:

1. **Portal da NF-e — notícias/NTs** (`nfe.fazenda.gov.br/portal/principal.aspx`) — toda NT e
   Informe Técnico da RTC é anunciado ali ("Publicada NT...", "Publicado Informe Técnico... RTC").
2. **NFS-e Nacional — página RTC** (`gov.br/nfse/.../documentacao-tecnica/rtc`) — NTs do CGNFS-e
   com os leiautes IBS/CBS da NFS-e (`RN_RTC_IBSCBS`, AnexoVII IndOp, AnexoVIII correlações).
3. **NFS-e Nacional — Documentação Atual (Produção)** (`.../documentacao-tecnica/documentacao-atual`)
   — versões de leiaute/esquemas do DPS em produção.

Item novo em qualquer fonte → **notificação no sino dos administradores da plataforma**.
Fora do monitor (revisão manual trimestral): atos do **Comitê Gestor do IBS** e regulamentação
da LC 214 (split payment, apuração assistida, alíquotas de referência do Senado).

## Auto-check de prontidão (roda junto com o monitor)

- **NF-e/NFC-e em produção contém `<IBSCBS>`?** — pega a última autorizada (ambiente PRODUCAO,
  emitida ≥ 2026) e confere o grupo no XML. Se sumir → alerta crítico no sino (regressão de leiaute).
- **NFS-e** — informativo: aguardando leiaute nacional.
- Resultado no JSON do cron (`/api/cron/reforma`) e alerta apenas quando algo está ERRADO.

## Checklist da entrega 2027 (abrir quando a regulamentação sair, ~2º semestre/2026)

- [ ] NT/leiaute 2027 da NF-e (alíquotas reais CBS + IS) → runbook
- [ ] Gate de data 2027: desligar cálculo/destaque de PIS/COFINS nas saídas
- [ ] Tabela de alíquotas CBS/IBS por `cClassTrib` (configurável, nada hardcoded)
- [ ] Imposto Seletivo: cadastro de produtos sujeitos + grupo no XML
- [ ] SPED/EFD: adequação das obrigações acessórias conforme publicado
- [ ] Financeiro: campos de split (bruto/líquido/tributo retido na liquidação) na conciliação
- [ ] Simples Nacional: regras específicas da transição p/ optantes (LC 214)

## Histórico

- 2026-07: criado o documento + monitor de fontes + auto-check (esta entrega).
- 2026-01: NF-e com IBSCBS/IBSCBSTot em produção (gate 2026-01-01), validada na SEFAZ.
