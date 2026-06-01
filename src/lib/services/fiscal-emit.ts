import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { LC116_LIST } from "@/domains/fiscal/lc116";

export type EmissaoCliente = {
  id: string;
  label: string;
  documento: string | null;
  inscricaoEstadual: string | null;
  email: string | null;
  uf: string | null;
  cidade: string | null;
};

export type EmissaoProduto = {
  id: string;
  sku: string;
  nome: string;
  preco: number;
  ncm: string | null;
  cfop: string | null;
  origem: string | null;
  unidade: string;
  disponivel: number;
};

export type EmissaoFormData = {
  clientes: EmissaoCliente[];
  produtos: EmissaoProduto[];
  lc116: Array<{ code: string; description: string }>;
  emitterUf: string | null;
  /** NFS-e: override do ambiente do município (true=nacional, false=padrão, null=auto). */
  nfseAmbienteNacional: boolean | null;
};

/** Dados para os formulários de emissão avulsa (NF-e/NFC-e/NFS-e). */
export async function getEmissaoFormData(): Promise<EmissaoFormData> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const scope = await getDevelopmentTenantScope();
  const base = scopedByTenantCompany(scope);

  const [clientes, produtos, empresa] = await Promise.all([
    prisma.cliente.findMany({
      where: { ...base, status: { in: ["ATIVO", "PENDENTE_APROVACAO"] } },
      orderBy: { razaoSocial: "asc" },
      include: {
        enderecos: { orderBy: { padrao: "desc" }, take: 1 },
        contatos: { orderBy: { principal: "desc" }, take: 1 }
      }
    }),
    prisma.produto.findMany({
      where: { ...base, ativo: true },
      orderBy: { nome: "asc" },
      include: { fiscal: true, saldosEstoque: true }
    }),
    prisma.empresa.findUnique({ where: { id: scope.empresaId }, select: { enderecoUf: true } })
  ]);

  return {
    emitterUf: empresa?.enderecoUf ?? null,
    lc116: LC116_LIST,
    clientes: clientes.map((c) => {
      const endereco = c.enderecos[0];
      const contato = c.contatos[0];
      return {
        id: c.id,
        label: c.nomeFantasia ?? c.razaoSocial,
        documento: c.documento,
        inscricaoEstadual: c.inscricaoEstadual,
        email: contato?.email ?? null,
        uf: endereco?.uf ?? null,
        cidade: endereco?.cidade ?? null
      };
    }),
    produtos: produtos.map((p) => ({
      id: p.id,
      sku: p.sku,
      nome: p.nome,
      preco: Number(p.precoVenda),
      ncm: p.fiscal?.ncm ?? p.ncm,
      cfop: p.cfop,
      origem: p.fiscal?.origem ?? p.origem,
      unidade: p.unidade,
      disponivel: p.saldosEstoque.reduce((s, x) => s + Math.max(Number(x.quantidade) - Number(x.reservado), 0), 0)
    }))
  };
}
