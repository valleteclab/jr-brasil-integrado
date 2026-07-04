import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { gerarOrdemServicoPdf } from "@/lib/pdf/ordem-servico-pdf";

/** PDF imprimível da OS (com logo do cliente) — para autorização e comprovante de retirada. */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("os");
    const scope = await getDevelopmentTenantScope();

    const os = await prisma.ordemServico.findFirst({
      where: { id: params.id, ...scopedByTenantCompany(scope) },
      include: {
        cliente: { select: { razaoSocial: true, nomeFantasia: true, documento: true, contatos: { where: { principal: true }, select: { telefone: true }, take: 1 } } },
        tecnicoResponsavel: { select: { nome: true } },
        servicos: { include: { tecnico: { select: { nome: true } } }, orderBy: { id: "asc" } },
        pecas: { include: { produto: { select: { sku: true, nome: true } } }, orderBy: { id: "asc" } },
        apontamentos: { include: { tecnico: { select: { nome: true } } }, orderBy: { criadoEm: "asc" } }
      }
    });
    if (!os) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });

    const [empresa, config] = await Promise.all([
      prisma.empresa.findUnique({ where: { id: scope.empresaId }, select: { razaoSocial: true, cnpj: true } }),
      prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId }, select: { logotipoInfo: true } })
    ]);

    const pdf = await gerarOrdemServicoPdf({
      numero: os.numero,
      status: os.status,
      criadoEm: os.criadoEm.toISOString(),
      previsaoEm: os.previsaoEm?.toISOString() ?? null,
      empresa: { razaoSocial: empresa?.razaoSocial ?? "Oficina", cnpj: empresa?.cnpj ?? null, logoDataUrl: config?.logotipoInfo ?? null },
      cliente: { nome: os.cliente.nomeFantasia || os.cliente.razaoSocial, documento: os.cliente.documento, telefone: os.cliente.contatos[0]?.telefone ?? null },
      equipamento: os.equipamento,
      placa: os.placaOuSerial,
      km: os.km,
      tecnicoResponsavel: os.tecnicoResponsavel?.nome ?? null,
      problemaRelatado: os.problemaRelatado,
      diagnostico: os.diagnostico,
      observacoes: os.observacoes,
      servicos: os.servicos.map((s) => ({ descricao: s.descricao, tecnico: s.tecnico?.nome ?? null, horas: Number(s.horas), valorHora: Number(s.valorHora), total: Number(s.total) })),
      pecas: os.pecas.map((p) => ({ sku: p.produto.sku, nome: p.produto.nome, quantidade: Number(p.quantidade), precoUnitario: Number(p.precoUnitario), total: Number(p.total) })),
      apontamentos: os.apontamentos.map((a) => ({ tecnico: a.tecnico.nome, descricao: a.descricao, horas: a.horas != null ? Number(a.horas) : null, data: a.criadoEm.toISOString() })),
      totalServicos: Number(os.totalServicos),
      totalPecas: Number(os.totalPecas),
      desconto: Number(os.desconto),
      total: Number(os.total)
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="OS-${os.numero}.pdf"` }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar o PDF da OS.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}
