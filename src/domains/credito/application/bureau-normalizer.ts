/**
 * Normaliza a resposta do bureau (ApiBrasil) para UM modelo único, independente do produto
 * (acerta/PF, sqod/PJ, credcadastral, essencialPositivo). A tela e o gate de venda a prazo
 * consomem só este modelo. Defensivo: cada produto tem shape próprio e campos podem faltar.
 */

export type RestricoesCredito = { protestos: number; pendencias: number; chequesSemFundo: number; acoesJudiciais: number; total: number };

export type CreditoNormalizado = {
  produto: string;
  nome: string | null;
  score: number | null;
  /** Faixa de risco A–E (quando o produto traz). */
  faixa: string | null;
  probabilidadeInadimplencia: number | null;
  /** Parecer/decisão consolidada do bureau. */
  decisao: "APROVADO" | "REPROVADO" | "ANALISE" | null;
  parecer: string | null;
  limiteRecomendado: number | null;
  capacidadePagamento: number | null;
  /** Renda presumida (PF) ou faturamento presumido (PJ), texto do bureau. */
  rendaOuFaturamento: string | null;
  restricoes: RestricoesCredito;
  temRestricao: boolean;
  protocolo: string | null;
  pdfUrl: string | null;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** "13,0%" → 13.0 | "5.1" → 5.1 | "5000,00" → 5000 | 720 → 720. */
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const limpo = v.replace(/%/g, "").trim();
  if (!limpo) return null;
  // Formato BR: "1.234,56" → remove pontos de milhar, vírgula vira ponto.
  const norm = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Conta ocorrências: aceita array direto, {ocorrencias:[]}, {quantidade_ocorrencia} ou {quantidadeTotal}. */
function conta(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (isObj(v)) {
    if (Array.isArray(v.ocorrencias)) return v.ocorrencias.length;
    const q = num(v.quantidade_ocorrencia ?? v.quantidade_ocorrencias ?? v.quantidadeTotal);
    if (q != null) return q;
  }
  return 0;
}

/** Acha o "root" dos dados de crédito descendo por data/data.data. */
function root(resp: Obj): Obj {
  const d1 = isObj(resp.data) ? resp.data : resp;
  const d2 = isObj(d1.data) ? (d1.data as Obj) : d1;
  return d2;
}

export function normalizarBureau(respBruta: unknown, tipoPessoa: "PF" | "PJ"): CreditoNormalizado {
  const resp = isObj(respBruta) ? respBruta : {};
  const r = root(resp);
  const base: CreditoNormalizado = {
    produto: "desconhecido", nome: null, score: null, faixa: null, probabilidadeInadimplencia: null,
    decisao: null, parecer: null, limiteRecomendado: null, capacidadePagamento: null,
    rendaOuFaturamento: null, restricoes: { protestos: 0, pendencias: 0, chequesSemFundo: 0, acoesJudiciais: 0, total: 0 },
    temRestricao: false, protocolo: null, pdfUrl: null
  };

  // ── PF: acerta (limite_recomendado + parecer + score.faixa) ──────────────
  if (isObj(r.acerta)) {
    const a = r.acerta as Obj;
    const sc = isObj(a.score) ? (a.score as Obj) : {};
    base.produto = "acerta";
    base.parecer = typeof a.parecer === "string" ? a.parecer : null;
    base.limiteRecomendado = num(a.limite_recomendado);
    base.score = num(sc.pontuacao);
    base.faixa = typeof sc.faixa === "string" ? sc.faixa : null;
    base.probabilidadeInadimplencia = num(sc.probabilidade_inadimplencia);
    base.decisao = base.parecer && /recomendad|aprovad/i.test(base.parecer) ? "APROVADO" : base.parecer ? "ANALISE" : null;
    const dp = isObj(r.dados_pessoais) ? (r.dados_pessoais as Obj) : {};
    base.nome = typeof dp.nome === "string" ? dp.nome : null;
    base.restricoes = {
      protestos: conta(r.protesto_sintetico), pendencias: conta(r.pendencias_financeiras),
      chequesSemFundo: conta(r.cheques_sem_fundo), acoesJudiciais: conta(r.acoes_judiciais), total: 0
    };
  }
  // ── PF: acertaEssencialPositivo (score + renda presumida) ────────────────
  else if (isObj(r.acertaEssencialPositivo)) {
    const cc = isObj((r.acertaEssencialPositivo as Obj).consultaCredito) ? ((r.acertaEssencialPositivo as Obj).consultaCredito as Obj) : {};
    const sc = isObj(cc.score) ? (cc.score as Obj) : {};
    const dc = isObj(cc.dadosCadastrais) ? (cc.dadosCadastrais as Obj) : {};
    base.produto = "acertaEssencialPositivo";
    base.score = num(sc.score);
    base.nome = typeof dc.nome === "string" ? dc.nome : null;
    base.rendaOuFaturamento = typeof dc.rendaPresumida === "string" ? dc.rendaPresumida : null;
    base.restricoes = {
      protestos: conta(cc.protestos), pendencias: conta(cc.pendenciasFinanceiras),
      chequesSemFundo: conta(cc.chequesSemFundo), acoesJudiciais: conta(cc.acoesCiveis), total: 0
    };
  }
  // ── PJ: sqod (informacoes_alertas_restricoes por título) ─────────────────
  else if (isObj(r.dados_receita_federal) || (isObj(r.informacoes_alertas_restricoes) && isObj(r.faturamento_presumido))) {
    base.produto = "sqod";
    const alertas = isObj(r.informacoes_alertas_restricoes) && Array.isArray((r.informacoes_alertas_restricoes as Obj).ocorrencias)
      ? ((r.informacoes_alertas_restricoes as Obj).ocorrencias as Obj[]) : [];
    const acha = (re: RegExp) => alertas.find((o) => typeof o.titulo === "string" && re.test(o.titulo));
    const concessao = acha(/concess.*cr[eé]dito/i);
    const prob = acha(/inadimpl/i);
    const capac = acha(/capacidade/i);
    const obs = (o?: Obj) => (o && typeof o.observacoes === "string" ? o.observacoes : null);
    base.parecer = obs(concessao);
    base.decisao = base.parecer ? (/aprovad/i.test(base.parecer) ? "APROVADO" : /reprovad|negad/i.test(base.parecer) ? "REPROVADO" : "ANALISE") : null;
    base.probabilidadeInadimplencia = num(obs(prob));
    base.capacidadePagamento = num(obs(capac));
    const rf = isObj(r.dados_receita_federal) ? (r.dados_receita_federal as Obj) : {};
    base.nome = typeof rf.razao_social === "string" ? rf.razao_social : (typeof rf.nome === "string" ? rf.nome : null);
    const fat = isObj(r.faturamento_presumido) ? (r.faturamento_presumido as Obj) : {};
    base.rendaOuFaturamento = typeof fat.faturamento_anual === "string" ? fat.faturamento_anual : null;
    const scores = isObj(r.scores) && Array.isArray((r.scores as Obj).ocorrencias) ? ((r.scores as Obj).ocorrencias as Obj[]) : [];
    base.score = num(scores[0]?.score);
    base.restricoes = { protestos: conta(r.protesto_sintetico), pendencias: 0, chequesSemFundo: 0, acoesJudiciais: 0, total: 0 };
    base.pdfUrl = typeof r.pdf === "string" ? r.pdf : null;
  }
  // ── PJ: quod-pj (restrições + resumoConsulta; score/alertas quando produção traz) ─────────
  else if (isObj(r.quod)) {
    const q = r.quod as Obj;
    base.produto = "quod-pj";
    const rc = isObj(q.resumoConsulta) ? (q.resumoConsulta as Obj) : {};
    const cnt = (arr: unknown, resumo: unknown) => Math.max(conta(arr), conta(resumo));
    base.restricoes = {
      protestos: cnt(q.protestos, rc.protestos),
      pendencias: cnt(q.pendenciasFinanceiras, rc.pendenciasFinanceiras),
      chequesSemFundo: cnt(q.chequesSemFundo, rc.chequesSemFundo),
      acoesJudiciais: cnt(q.acoesCiveis, rc.acoesCiveis), total: 0
    };
    // Campos ricos quando o provedor os traz (produção): score e alertas por título.
    const sc = isObj(q.score) ? (q.score as Obj) : {};
    base.score = num(sc.score ?? sc.pontuacao ?? q.score);
    const alertas = isObj(q.informacoes_alertas_restricoes) && Array.isArray((q.informacoes_alertas_restricoes as Obj).ocorrencias)
      ? ((q.informacoes_alertas_restricoes as Obj).ocorrencias as Obj[]) : [];
    const concessao = alertas.find((o) => typeof o.titulo === "string" && /concess.*cr[eé]dito/i.test(o.titulo));
    if (concessao && typeof concessao.observacoes === "string") {
      base.parecer = concessao.observacoes;
      base.decisao = /aprovad/i.test(base.parecer) ? "APROVADO" : /reprovad|negad/i.test(base.parecer) ? "REPROVADO" : "ANALISE";
    }
    if (typeof (q as Obj).nome === "string") base.nome = (q as Obj).nome as string;
  }
  // ── PJ: credcadastral (score risco 12m + pend/protestos) ─────────────────
  else if (isObj(r.credcadastral)) {
    const c = r.credcadastral as Obj;
    base.produto = "credcadastral";
    const scores = isObj(c.scores) && Array.isArray((c.scores as Obj).ocorrencias) ? ((c.scores as Obj).ocorrencias as Obj[]) : [];
    base.score = num(scores[0]?.score);
    base.probabilidadeInadimplencia = num(scores[0]?.probabilidade_inadimplencia);
    base.faixa = typeof scores[0]?.classif_abc === "string" ? (scores[0].classif_abc as string) : null;
    const emp = isObj(c.informacoes_da_empresa) ? (c.informacoes_da_empresa as Obj) : {};
    base.nome = typeof emp.razao_social === "string" ? emp.razao_social : null;
    base.restricoes = {
      protestos: conta(c.protestos), pendencias: conta(c.pend_financeiras),
      chequesSemFundo: conta(c.ch_sem_fundos_bacen) + conta(c.ch_sem_fundos_varejo), acoesJudiciais: 0, total: 0
    };
  }

  base.restricoes.total = base.restricoes.protestos + base.restricoes.pendencias + base.restricoes.chequesSemFundo + base.restricoes.acoesJudiciais;
  base.temRestricao = base.restricoes.total > 0;
  // PDF genérico no envelope (alguns produtos põem em data.pdf).
  if (!base.pdfUrl && typeof (r as Obj).pdf === "string") base.pdfUrl = (r as Obj).pdf as string;
  const rr = isObj(r.resumoRetorno) ? (r.resumoRetorno as Obj) : (isObj((r as Obj).resumoRetorno) ? (r as Obj).resumoRetorno as Obj : {});
  if (typeof rr.protocolo === "string") base.protocolo = rr.protocolo;
  return base;
}
