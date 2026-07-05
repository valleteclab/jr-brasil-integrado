import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * RELATÓRIO DE ST (read-only, rota de operação protegida por CRON_SECRET). Cruza os NCMs dos
 * produtos de uma empresa (default JR Brasil) com a tabela CEST (Convênio ICMS 92/2015): um NCM
 * que possui CEST está num segmento sujeito a ICMS-ST/antecipação (autopeças = segmento 01).
 *
 * NÃO altera cadastro. É um indicativo de EXPOSIÇÃO a ST — a aplicação efetiva ainda depende da UF
 * de destino e de protocolo/convênio entre as UFs; validar com o contador.
 *
 *   curl -sS "https://erp.sisgov.app.br/api/cron/relatorio-st?cnpj=43954482000121" \
 *        -H "x-cron-secret: <CRON_SECRET>"
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("x-cron-secret")?.trim() === secret;
}

async function resolverEmpresa(cnpj: string) {
  const digitos = cnpj.replace(/\D/g, "");
  if (!digitos) return null;
  const empresas = await prisma.empresa.findMany({ select: { id: true, tenantId: true, cnpj: true, razaoSocial: true } });
  return empresas.find((e) => (e.cnpj ?? "").replace(/\D/g, "") === digitos) ?? null;
}

const SEGMENTO: Record<string, string> = {
  "01": "Autopeças", "02": "Bebidas alcoólicas", "03": "Bebidas/águas/cervejas", "04": "Cigarros",
  "05": "Cimento", "06": "Combustíveis/lubrificantes", "07": "Energia elétrica", "08": "Ferramentas",
  "09": "Lâmpadas/eletrônicos", "10": "Materiais de construção", "11": "Materiais de limpeza",
  "12": "Materiais elétricos", "13": "Medicamentos/perfumaria", "14": "Papéis/papelaria",
  "15": "Plásticos", "16": "Pneumáticos", "17": "Produtos alimentícios", "18": "Sorvetes",
  "19": "Tintas/vernizes", "20": "Veículos automotores", "21": "Veículos duas rodas", "22": "Vidros",
  "23": "Venda a distância", "24": "Produtos cerâmicos", "25": "Autopeças (compl.)", "26": "Produtos de higiene",
  "28": "Artefatos de uso doméstico"
};

export async function GET(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const url = new URL(request.url);
    // Lista os CEST de um segmento (?seg=01 → autopeças) com descrição, para montar o De/Para
    // família→CEST com os códigos OFICIAIS da tabela (sem inventar código).
    const seg = url.searchParams.get("seg");
    if (seg) {
      const dig = seg.replace(/\D/g, "").slice(0, 2);
      const lista = await prisma.cest.findMany({
        where: { codigo: { startsWith: dig } },
        orderBy: { codigo: "asc" },
        select: { codigo: true, descricao: true }
      });
      return NextResponse.json({ segmento: dig, total: lista.length, itens: lista });
    }
    // Diagnóstico da tabela CEST: ?probe=8708 → mostra se o capítulo tem CEST e como os NCMs estão gravados.
    const probe = url.searchParams.get("probe");
    if (probe) {
      const dig = probe.replace(/\D/g, "");
      const seg01 = await prisma.cest.count({ where: { codigo: { startsWith: "01" } } });
      const todos = await prisma.cest.findMany({ select: { codigo: true, ncms: true } });
      const comPrefixo = todos.filter((c) => c.ncms.some((n) => n.startsWith(dig)));
      return NextResponse.json({
        cestTotal: todos.length,
        cestSegmento01_autopecas: seg01,
        cestComNcmPrefixo: comPrefixo.length,
        exemplos: comPrefixo.slice(0, 15).map((c) => ({ cest: c.codigo, ncms: c.ncms.filter((n) => n.startsWith(dig)).slice(0, 6) })),
        amostraNcmsGravados: todos.slice(0, 3).map((c) => ({ cest: c.codigo, ncms: c.ncms.slice(0, 5) }))
      });
    }
    const cnpj = url.searchParams.get("cnpj") ?? "43954482000121";
    const empresa = await resolverEmpresa(cnpj);
    if (!empresa) return NextResponse.json({ error: `Empresa com CNPJ ${cnpj} não encontrada.` }, { status: 404 });

    const cestTotal = await prisma.cest.count();

    // NCMs distintos dos produtos da empresa (com contagem).
    const grupos = await prisma.produto.groupBy({
      by: ["ncm"],
      where: { tenantId: empresa.tenantId, empresaId: empresa.id, ncm: { not: null } },
      _count: { _all: true }
    });

    const itens = [];
    let produtosComCest = 0, produtosSemCest = 0;
    for (const g of grupos) {
      const ncm = g.ncm as string;
      const qtd = g._count._all;
      const cests = await prisma.cest.findMany({ where: { ncms: { has: ncm } }, select: { codigo: true, descricao: true } });
      const st = cests.length > 0;
      if (st) produtosComCest += qtd; else produtosSemCest += qtd;
      const segmentos = [...new Set(cests.map((c) => SEGMENTO[c.codigo.slice(0, 2)] ?? c.codigo.slice(0, 2)))];
      itens.push({
        ncm,
        produtos: qtd,
        st,
        segmentos,
        cests: cests.slice(0, 12).map((c) => ({ codigo: c.codigo, descricao: c.descricao })),
        cestTotal: cests.length
      });
    }
    itens.sort((a, b) => Number(b.st) - Number(a.st) || b.produtos - a.produtos);

    const totalProdutos = grupos.reduce((s, g) => s + g._count._all, 0);
    return NextResponse.json({
      empresa: { razaoSocial: empresa.razaoSocial },
      aviso: "Indicativo de exposição a ST (NCM no Convênio 92/2015). A aplicação efetiva depende da UF de destino e de protocolo/convênio — validar com o contador.",
      cestTabelaCarregada: cestTotal,
      resumo: {
        produtos: totalProdutos,
        ncmsDistintos: grupos.length,
        ncmSujeitosST: itens.filter((i) => i.st).length,
        produtosSujeitosST: produtosComCest,
        produtosNaoST: produtosSemCest
      },
      itens
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no relatório.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
