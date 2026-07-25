import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { formatDocumento } from "@/lib/fiscal/documento";
import { gerarRelatorioPdf, type RelatorioSecao, type RelatorioKpi } from "@/lib/pdf/relatorio-pdf";
import { CreditoError } from "./carteira-use-cases";
import type { CreditoNormalizado } from "./bureau-normalizer";

/**
 * LAUDO PRÓPRIO da consulta de crédito em PDF: monta um relatório completo a partir do que o
 * bureau devolveu (resultado normalizado + resposta bruta), com a identidade da empresa que
 * consultou. Cobre os produtos que NÃO emitem laudo PDF (ex.: credcadastral) — e serve de laudo
 * complementar para os demais. Defensivo: cada seção só entra se os dados existirem no bruto.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Desce em data/data.data e devolve o bloco do produto credcadastral (ou null). */
function blocoCredcadastral(bruto: unknown): Obj | null {
  if (!isObj(bruto)) return null;
  const d1 = isObj(bruto.data) ? bruto.data : bruto;
  const d2 = isObj(d1.data) ? (d1.data as Obj) : d1;
  return isObj(d2.credcadastral) ? (d2.credcadastral as Obj) : null;
}

function linhaSeValor(rotulo: string, valor: string | null): string[][] {
  return valor ? [[rotulo, valor]] : [];
}

export async function gerarLaudoCreditoPdf(scope: TenantScope, consultaId: string): Promise<{ pdf: Buffer; nomeArquivo: string }> {
  const consulta = await prisma.consultaCredito.findFirst({
    where: { id: consultaId, tenantId: scope.tenantId }
  });
  if (!consulta) throw new CreditoError("Consulta de crédito não encontrada.");

  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId, tenantId: scope.tenantId },
    select: { razaoSocial: true, cnpj: true }
  });
  const cfgFiscal = await prisma.configuracaoFiscal.findUnique({
    where: { empresaId: scope.empresaId },
    select: { logotipoConteudo: true }
  });

  const n = (consulta.resultado ?? {}) as Partial<CreditoNormalizado>;
  const cc = blocoCredcadastral(consulta.bruto);
  const secoes: RelatorioSecao[] = [];

  // ── KPIs do topo ──
  const kpis: RelatorioKpi[] = [];
  if (n.score != null) kpis.push({ label: "Score", valor: String(n.score) });
  if (n.probabilidadeInadimplencia != null) kpis.push({ label: "Risco de inadimplência", valor: `${String(n.probabilidadeInadimplencia).replace(".", ",")}%` });
  kpis.push({ label: "Decisão", valor: n.decisao === "APROVADO" ? "Crédito recomendado" : n.decisao === "REPROVADO" ? "Não recomendado" : n.decisao === "ANALISE" ? "Analisar" : "—" });
  kpis.push({ label: "Restrições", valor: String(n.restricoes?.total ?? 0) });

  // ── Identificação (PF ou PJ) ──
  const pf = cc && isObj(cc.identificacao_pessoa_fisica) ? (cc.identificacao_pessoa_fisica as Obj) : null;
  const pj = cc && isObj(cc.informacoes_da_empresa) ? (cc.informacoes_da_empresa as Obj) : null;
  const identLinhas: string[][] = [
    ...linhaSeValor("Nome", s(pf?.nome) ?? s(pj?.razao_social) ?? n.nome ?? null),
    ...linhaSeValor("Documento", formatDocumento(consulta.documento)),
    ...linhaSeValor("Situação do CPF", s(pf?.cpf_situacao)),
    ...linhaSeValor("Nascimento", s(pf?.nascimento)),
    ...linhaSeValor("Sexo", s(pf?.sexo)),
    ...linhaSeValor("Estado civil", s(pf?.estado_civil)),
    ...linhaSeValor("Escolaridade", s(pf?.grau_instrucao)),
    ...linhaSeValor("Nome da mãe", s(pf?.mae)),
    ...linhaSeValor("RG", pf && s(pf.rg_numero) ? `${s(pf.rg_numero)}${s(pf.rg_uf) ? ` (${s(pf.rg_uf)})` : ""}` : null),
    ...linhaSeValor("Indicação de óbito", s(pf?.indicacao_obito))
  ];
  if (identLinhas.length) {
    secoes.push({ titulo: "Identificação", tabela: { colunas: [{ label: "Campo" }, { label: "Informação", peso: 2 }], linhas: identLinhas } });
  }

  // ── Score e risco ──
  const scores = cc && isObj(cc.scores) && Array.isArray((cc.scores as Obj).ocorrencias) ? ((cc.scores as Obj).ocorrencias as Obj[]) : [];
  const textoScore = s(scores[0]?.texto) ?? s(scores[0]?.risco);
  if (n.score != null || textoScore) {
    secoes.push({
      titulo: "Score de crédito",
      texto: [
        n.score != null ? `Pontuação: ${n.score}${n.faixa ? ` (faixa ${n.faixa})` : ""}.` : null,
        textoScore ? `Interpretação do bureau: ${textoScore}` : null,
        n.parecer ? `Decisão de negócio do bureau: ${n.parecer}.` : null
      ].filter(Boolean).join("\n")
    });
  }

  // ── Renda presumida ──
  const renda = cc && isObj(cc.renda_presumida) ? (cc.renda_presumida as Obj) : null;
  if (renda && (s(renda.faixa) || s(renda.renda_anual))) {
    secoes.push({
      titulo: "Renda presumida",
      tabela: {
        colunas: [{ label: "Campo" }, { label: "Informação", peso: 2 }],
        linhas: [
          ...linhaSeValor("Renda mensal (faixa)", s(renda.faixa)),
          ...linhaSeValor("Renda anual", s(renda.renda_anual)),
          ...linhaSeValor("Classe econômica", s(renda.mensagem))
        ]
      }
    });
  } else if (n.rendaOuFaturamento) {
    secoes.push({ titulo: "Renda / faturamento presumido", texto: n.rendaOuFaturamento });
  }

  // ── Restrições ──
  const r = n.restricoes;
  secoes.push({
    titulo: "Restrições e apontamentos",
    tabela: {
      colunas: [{ label: "Tipo", peso: 2 }, { label: "Ocorrências", align: "right" }],
      linhas: [
        ["Pendências financeiras", String(r?.pendencias ?? 0)],
        ["Protestos", String(r?.protestos ?? 0)],
        ["Cheques sem fundo", String(r?.chequesSemFundo ?? 0)],
        ["Ações judiciais", String(r?.acoesJudiciais ?? 0)]
      ],
      total: ["Total", String(r?.total ?? 0)]
    }
  });

  // ── Pendências detalhadas (quando o bureau lista) ──
  const pend = cc && isObj(cc.pend_financeiras) && Array.isArray((cc.pend_financeiras as Obj).ocorrencias)
    ? ((cc.pend_financeiras as Obj).ocorrencias as Obj[]) : [];
  if (pend.length) {
    secoes.push({
      titulo: "Pendências financeiras — detalhe",
      tabela: {
        colunas: [{ label: "Credor/Informante", peso: 2 }, { label: "Data" }, { label: "Valor", align: "right" }],
        linhas: pend.slice(0, 40).map((p) => [
          s(p.credor) ?? s(p.informante) ?? s(p.provedor) ?? "-",
          s(p.data_ocorrencia) ?? s(p.data) ?? "-",
          s(p.valor) ?? "-"
        ])
      }
    });
  }

  // ── Endereços ──
  const ends = cc && isObj(cc.somente_endereco) && Array.isArray((cc.somente_endereco as Obj).dados)
    ? ((cc.somente_endereco as Obj).dados as Obj[]) : [];
  const endLinhas = ends
    .map((e) => {
      const rua = [s(e.endereco), s(e.numero)].filter(Boolean).join(", ");
      const cidade = [s(e.bairro), [s(e.cidade), s(e.uf)].filter(Boolean).join("/")].filter(Boolean).join(" — ");
      const cep = s(e.cep);
      return [rua || "-", cidade || "-", cep ? cep.replace(/^(\d{5})(\d{3})$/, "$1-$2") : "-"];
    })
    .filter((l) => l[0] !== "-" || l[1] !== "-");
  if (endLinhas.length) {
    secoes.push({ titulo: "Endereços localizados", tabela: { colunas: [{ label: "Endereço", peso: 2 }, { label: "Bairro/Cidade", peso: 2 }, { label: "CEP" }], linhas: endLinhas } });
  }

  // ── E-mails e contatos ──
  const emails = cc && isObj(cc.emails) && Array.isArray((cc.emails as Obj).infoemails) ? ((cc.emails as Obj).infoemails as Obj[]) : [];
  const contatos = cc && isObj(cc.contatos) && Array.isArray((cc.contatos as Obj).infocontatos) ? ((cc.contatos as Obj).infocontatos as Obj[]) : [];
  const contatoLinhas: string[][] = [
    ...emails.map((e) => ["E-mail", s(e.endereco) ?? "-", ""]).filter((l) => l[1] !== "-"),
    ...contatos.map((c) => [
      s(c.relacao) ?? "Contato",
      s(c.nome) ?? "-",
      [s(c.documento) ? `Doc. ${formatDocumento(s(c.documento))}` : null, s(c.nascimento) ? `nasc. ${s(c.nascimento)}` : null].filter(Boolean).join(" · ")
    ]).filter((l) => l[1] !== "-")
  ];
  if (contatoLinhas.length) {
    secoes.push({ titulo: "Contatos e e-mails localizados", tabela: { colunas: [{ label: "Tipo" }, { label: "Informação", peso: 2 }, { label: "Detalhes", peso: 2 }], linhas: contatoLinhas } });
  }

  // ── Alertas / informações do bureau ──
  const alertas = cc && isObj(cc.informacoes_alertas_restricoes) && Array.isArray((cc.informacoes_alertas_restricoes as Obj).ocorrencias)
    ? ((cc.informacoes_alertas_restricoes as Obj).ocorrencias as Obj[]) : [];
  const alertaLinhas = alertas
    .map((a) => [s(a.titulo) ?? "-", s(a.observacoes) ?? "-"])
    .filter((l) => l[0] !== "-" || l[1] !== "-");
  if (alertaLinhas.length) {
    secoes.push({ titulo: "Alertas e informações do bureau", tabela: { colunas: [{ label: "Título", peso: 2 }, { label: "Observações", peso: 3 }], linhas: alertaLinhas } });
  }

  const consultadoEm = consulta.consultadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const pdf = await gerarRelatorioPdf({
    titulo: "Laudo de análise de crédito",
    subtitulo: `${n.nome ?? formatDocumento(consulta.documento)} · consulta de ${consultadoEm}`,
    empresa: {
      razaoSocial: empresa?.razaoSocial ?? "",
      cnpj: empresa?.cnpj ?? null,
      logoDataUrl: cfgFiscal?.logotipoConteudo ?? null
    },
    kpis,
    secoes,
    rodape: `Fonte: bureau de crédito (produto ${consulta.produto}). Laudo gerado pelo sistema a partir da resposta original da consulta. Uso restrito à análise de crédito — dados pessoais protegidos pela LGPD.`
  });

  return { pdf, nomeArquivo: `laudo-credito-${consulta.documento}.pdf` };
}
