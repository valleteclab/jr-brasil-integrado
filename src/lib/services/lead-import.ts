import { prisma } from "@/lib/db/prisma";

/**
 * Importador de leads de prospecção (plataforma): consulta a base ProspeccaoEmpresa
 * (dados abertos CNPJ/RFB ingeridos por UF) e cria PlataformaLead prontos para o funil,
 * com abordagem/presente por segmento. Modo Emissor: confirma Simples/MEI na minhareceita
 * (só entra optante — o alvo do plano de R$ 99,90).
 */

/** Presets de segmento → prefixos de CNAE (7 dígitos sem máscara) + abordagem. */
export const SEGMENTOS_PROSPECCAO: Record<string, { rotulo: string; cnaes: string[]; dor: string }> = {
  autopecas: {
    rotulo: "Autopeças",
    cnaes: ["45307"],
    dor: "Controle de estoque de peças + nota fiscal na hora (NF-e/NFC-e) + catálogo com aplicações por veículo."
  },
  oficinas: {
    rotulo: "Oficinas mecânicas",
    cnaes: ["45200"],
    dor: "Ordem de serviço + orçamento no WhatsApp do cliente + NFS-e automática (padrão nacional novo)."
  },
  mercados: {
    rotulo: "Mercados e minimercados",
    cnaes: ["47113", "47121"],
    dor: "PDV com cupom fiscal (NFC-e), estoque com conversão fardo→unidade e contas a pagar organizadas."
  },
  materiais_construcao: {
    rotulo: "Materiais de construção",
    cnaes: ["47440"],
    dor: "Orçamento rápido no balcão, crediário com controle e nota fiscal sem complicação."
  },
  servicos_gerais: {
    rotulo: "Serviços (amplo p/ Emissor)",
    cnaes: ["43", "49", "56", "62", "69", "70", "71", "73", "74", "77", "81", "82", "85", "86", "95", "96"],
    dor: "Emitir NFS-e no padrão nacional sem depender de contador — plano Emissor R$ 99,90 com 20 notas."
  }
};

export type ImportarLeadsInput = {
  uf: string;
  segmento?: string | null;
  cnaesLivres?: string[] | null;
  quantidade: number;
  modoEmissor: boolean;
  campanha?: string | null;
  presente?: string | null;
};

export const PRESENTE_PADRAO =
  "🎁 Diagnóstico fiscal GRATUITO do seu CNPJ (regime, obrigações e o que muda com a Reforma) + 1º mês grátis + guia do certificado digital A1 sem custo.";

const norm = (s: string) => s.replace(/\D/g, "");

async function consultaMinhaReceita(cnpj: string): Promise<{ razao?: string; simples?: boolean; mei?: boolean; telefone?: string; email?: string } | null> {
  try {
    const res = await fetch(`https://minhareceita.org/${cnpj}`, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      razao_social?: string; opcao_pelo_simples?: boolean | null; opcao_pelo_mei?: boolean | null;
      ddd_telefone_1?: string | null; email?: string | null;
    };
    return {
      razao: d.razao_social,
      simples: d.opcao_pelo_simples === true,
      mei: d.opcao_pelo_mei === true,
      telefone: d.ddd_telefone_1 ?? undefined,
      email: d.email ?? undefined
    };
  } catch {
    return null;
  }
}

export async function importarLeadsProspeccao(input: ImportarLeadsInput) {
  const uf = input.uf.trim().toUpperCase();
  const preset = input.segmento ? SEGMENTOS_PROSPECCAO[input.segmento] : null;
  const prefixos = [
    ...(preset?.cnaes ?? []),
    ...((input.cnaesLivres ?? []).map(norm).filter((c) => c.length >= 2))
  ];
  if (!prefixos.length) throw new Error("Escolha um segmento ou informe ao menos um CNAE.");
  const quantidade = Math.min(Math.max(input.quantidade || 20, 1), 100);

  const disponivel = await prisma.prospeccaoEmpresa.count({ where: { uf } });
  if (!disponivel) {
    throw new Error(`A base de prospecção da UF ${uf} ainda não foi ingerida. Rode ./deploy/prospeccao-ingest.sh ${uf} na VPS.`);
  }

  // Candidatos: CNAE no(s) prefixo(s), com telefone (a abordagem é WhatsApp-first),
  // pulando quem já está no funil. Busca em lotes por causa do filtro de prefixo.
  const jaNoFunil = new Set(
    (await prisma.plataformaLead.findMany({ where: { cnpj: { not: null } }, select: { cnpj: true } }))
      .map((l) => norm(l.cnpj as string))
  );
  const candidatos = await prisma.prospeccaoEmpresa.findMany({
    where: {
      uf,
      telefone: { not: null },
      OR: prefixos.map((p) => ({ cnae: { startsWith: p } }))
    },
    orderBy: [{ email: { sort: "desc", nulls: "last" } }, { dataInicio: "desc" }],
    take: quantidade * (input.modoEmissor ? 6 : 3)
  });

  const municipios = new Map(
    (await prisma.prospeccaoMunicipio.findMany()).map((m) => [m.codigo, m.nome])
  );

  const criados: string[] = [];
  let pulados = 0, foraDoPerfil = 0;
  const presente = (input.presente ?? PRESENTE_PADRAO).trim();
  const dorBase = preset?.dor ?? "Emitir nota e organizar o financeiro sem trocar de sistema.";

  for (const c of candidatos) {
    if (criados.length >= quantidade) break;
    if (jaNoFunil.has(c.cnpj)) { pulados++; continue; }

    let nome = c.nomeFantasia ?? null;
    let telefone = c.telefone ?? null;
    let email = c.email ?? null;

    if (input.modoEmissor) {
      const info = await consultaMinhaReceita(c.cnpj);
      if (!info || (!info.simples && !info.mei)) { foraDoPerfil++; continue; }
      nome = nome || info.razao || null;
      telefone = telefone || (info.telefone ? norm(info.telefone) : null);
      email = email || info.email?.toLowerCase() || null;
    }

    await prisma.plataformaLead.create({
      data: {
        empresa: nome ?? `CNPJ ${c.cnpj}`,
        cnpj: c.cnpj,
        telefone,
        email,
        segmento: preset?.rotulo ?? `CNAE ${c.cnae}`,
        cidade: (c.municipioTom && municipios.get(c.municipioTom)) || null,
        uf,
        canalOrigem: "OUTRO",
        origem: "prospeccao-cnpj",
        campanha: input.campanha?.trim() || `prospeccao-${uf.toLowerCase()}`,
        dorPrincipal: `${dorBase}\n\nPRESENTE DE ABERTURA: ${presente}`
      }
    });
    criados.push(c.cnpj);
    jaNoFunil.add(c.cnpj);
  }

  return {
    uf,
    disponivel,
    candidatosAvaliados: candidatos.length,
    criados: criados.length,
    pulados,
    foraDoPerfil,
    modoEmissor: input.modoEmissor
  };
}
