import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createQuote } from "@/domains/sales-quote/application/quote-use-cases";
import { normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * Importa ORÇAMENTOS ABERTOS do sistema anterior como orçamentos REAIS (EM_ANALISE — pipeline
 * vivo, conversível em venda). CSV flat no corpo (1 linha por item):
 *   numero;data;codParceiro;parceiro;fone;email;negociacao;total;vendedor;itemCodigo;itemDescricao;itemRef;itemPreco;itemQtd;itemDesconto;itemTotal
 * De/Para: cliente por codigoExterno; produto pela REFERÊNCIA → SKU do catálogo. Itens sem SKU
 * casado NÃO entram no orçamento (vão para a observação do vendedor). Idempotente: orçamento já
 * importado (observação carrega "[migrado #numero]") é pulado. CRON_SECRET + ?cnpj= + ?dry=1.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const num = (v: string) => { const n = Number((v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("x-cron-secret")?.trim() !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const dry = url.searchParams.get("dry") === "1";
    const cnpjParam = normalizeDocumento(url.searchParams.get("cnpj") ?? "");
    const empresas = await prisma.empresa.findMany({ select: { id: true, tenantId: true, cnpj: true, razaoSocial: true } });
    const empresa = empresas.find((e) => normalizeDocumento(e.cnpj) === cnpjParam);
    if (!empresa) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    // Ambiente fiscal da empresa — sem isso o orçamento cai em HOMOLOGACAO e some da tela.
    const cfgFiscal = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: empresa.id }, select: { ambiente: true } });
    const scope = { tenantId: empresa.tenantId, empresaId: empresa.id, ambiente: cfgFiscal?.ambiente ?? "PRODUCAO" as const };

    const rows = (await request.text()).split(/\r?\n/).filter((l) => l.trim());
    const header = rows.shift()?.split(";") ?? [];
    const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
    type Orc = { numero: string; data: string; codParceiro: string; parceiro: string; negociacao: string; vendedor: string; itens: { ref: string; codigo: string; descricao: string; preco: number; qtd: number }[] };
    const orcs = new Map<string, Orc>();
    for (const raw of rows) {
      const c = raw.split(";");
      const g = (n: string) => (c[idx[n]] ?? "").trim();
      const numero = g("numero");
      if (!numero) continue;
      if (!orcs.has(numero)) {
        orcs.set(numero, { numero, data: g("data"), codParceiro: g("codParceiro"), parceiro: g("parceiro"), negociacao: g("negociacao"), vendedor: g("vendedor"), itens: [] });
      }
      orcs.get(numero)!.itens.push({ ref: g("itemRef"), codigo: g("itemCodigo"), descricao: g("itemDescricao"), preco: num(g("itemPreco")), qtd: num(g("itemQtd")) || 1 });
    }

    const clientes = await prisma.cliente.findMany({
      where: { ...scope, codigoExterno: { not: null } }, select: { id: true, codigoExterno: true }
    });
    const porCodigo = new Map(clientes.map((cl) => [cl.codigoExterno as string, cl.id]));
    const produtos = await prisma.produto.findMany({ where: scope, select: { id: true, sku: true } });
    const porSku = new Map(produtos.map((p) => [p.sku.toUpperCase(), p.id]));
    const jaImportados = await prisma.orcamento.findMany({
      where: { ...scope, observacaoVendedor: { contains: "[migrado #" } }, select: { observacaoVendedor: true }
    });
    const marcados = new Set(jaImportados.map((o) => /\[migrado #(\S+)\]/.exec(o.observacaoVendedor ?? "")?.[1]).filter(Boolean));

    const lista = [...orcs.values()];
    // ?criarFaltantes=1 → cadastra produto (sku=referência, nome=descrição, preço do orçamento;
    // fiscal genérico p/ revisão) e cliente (código+nome) que faltarem no De/Para.
    const criarFaltantes = url.searchParams.get("criarFaltantes") === "1";
    let produtosCriados = 0, clientesCriados = 0;
    const categoria = criarFaltantes
      ? await prisma.produtoCategoria.findFirst({ where: { tenantId: scope.tenantId, empresaId: scope.empresaId }, select: { id: true } })
      : null;

    let criados = 0, pulados = 0, semCliente = 0, itensSemSku = 0, semItens = 0;
    const avisos: string[] = [];
    for (const o of lista) {
      if (marcados.has(o.numero)) { pulados++; continue; }
      let clienteId = porCodigo.get(o.codParceiro);
      if (!clienteId && criarFaltantes && !dry && o.codParceiro) {
        const novo = await prisma.cliente.create({
          data: { ...scope, razaoSocial: o.parceiro, documento: "", codigoExterno: o.codParceiro, status: "ATIVO" }
        });
        porCodigo.set(o.codParceiro, novo.id);
        clienteId = novo.id; clientesCriados++;
      }
      if (!clienteId) { semCliente++; avisos.push(`orç ${o.numero}: cliente cód ${o.codParceiro} (${o.parceiro}) sem De/Para`); continue; }
      if (criarFaltantes && !dry && categoria) {
        for (const i of o.itens) {
          const sku = (i.ref || i.codigo).toUpperCase();
          if (!porSku.has(sku)) {
            const p = await prisma.produto.create({
              data: { ...scope, sku, nome: i.descricao, categoriaId: categoria.id, precoVenda: i.preco }
            });
            porSku.set(sku, p.id); produtosCriados++;
          }
        }
      }
      const casados = o.itens.map((i) => ({ ...i, produtoId: porSku.get((i.ref || i.codigo).toUpperCase()) ?? null }));
      const validos = casados.filter((i) => i.produtoId);
      const perdidos = casados.filter((i) => !i.produtoId);
      itensSemSku += perdidos.length;
      if (!validos.length) { semItens++; avisos.push(`orç ${o.numero}: nenhum item casou SKU`); continue; }
      if (dry) { criados++; continue; }
      await createQuote(scope, {
        clienteId,
        itens: validos.map((i) => ({ produtoId: i.produtoId as string, quantidade: i.qtd, precoUnitario: i.preco })),
        vendedor: o.vendedor || undefined,
        condicaoPagamento: o.negociacao || undefined,
        validadeDias: 30,
        canal: "MIGRACAO",
        observacaoVendedor: `[migrado #${o.numero}] Orçamento ${o.numero} de ${o.data} do sistema anterior.` +
          (perdidos.length ? ` Itens NÃO incluídos (sem produto no catálogo): ${perdidos.map((p) => `${p.descricao} (${p.ref || p.codigo})`).join("; ")}` : "")
      });
      criados++;
    }
    return NextResponse.json({ dry, empresa: empresa.razaoSocial, orcamentos: lista.length, criados, pulados, semCliente, semItensCasados: semItens, itensSemSku, produtosCriados, clientesCriados, avisos: avisos.slice(0, 20) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro na importação." }, { status: 500 });
  }
}
