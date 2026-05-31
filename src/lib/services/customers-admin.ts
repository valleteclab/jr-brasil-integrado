import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

export type CustomerDetailedSummary = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  documento: string;
  inscricaoEstadual: string | null;
  status: string;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "mute";
  segmento: string | null;
  limiteCredito: string;
  creditoUsado: string;
  creditoDisponivel: string;
  condicaoPagamento: string | null;
  tabelaPrecoId: string | null;
  tabelaPrecoNome: string | null;
  contatosPrincipal: string | null;
  totalEnderecos: number;
  totalContatos: number;
  criadoEm: string;
};

export type CustomerDetail = CustomerDetailedSummary & {
  contatos: {
    id: string;
    nome: string;
    email: string | null;
    telefone: string | null;
    whatsapp: string | null;
    cargo: string | null;
    principal: boolean;
  }[];
  enderecos: {
    id: string;
    apelido: string;
    cep: string;
    logradouro: string;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string;
    uf: string;
    codigoMunicipioIbge: string | null;
    padrao: boolean;
  }[];
};

export type TabelaPrecoOption = {
  id: string;
  nome: string;
};

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ATIVO: "Ativo",
    PENDENTE_APROVACAO: "Pendente de aprovação",
    BLOQUEADO: "Bloqueado",
    INATIVO: "Inativo"
  };
  return labels[status] ?? status;
}

function statusTone(status: string): "success" | "warn" | "danger" | "mute" {
  if (status === "ATIVO") return "success";
  if (status === "PENDENTE_APROVACAO") return "warn";
  if (status === "BLOQUEADO") return "danger";
  return "mute";
}

export async function listCustomersDetailed(): Promise<CustomerDetailedSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados para listar clientes.");
  }

  try {
    const scope = await getDevelopmentTenantScope();

    const customers = await prisma.cliente.findMany({
      where: scopedByTenantCompany(scope),
      include: {
        tabelaPreco: { select: { nome: true } },
        contatos: { select: { nome: true, principal: true } },
        enderecos: { select: { id: true } }
      },
      orderBy: { razaoSocial: "asc" }
    });

    return customers.map((c) => {
      const limite = Number(c.limiteCredito);
      const usado = Number(c.creditoUsado);
      const principal = c.contatos.find((ct) => ct.principal)?.nome ?? c.contatos[0]?.nome ?? null;

      return {
        id: c.id,
        razaoSocial: c.razaoSocial,
        nomeFantasia: c.nomeFantasia,
        documento: c.documento,
        inscricaoEstadual: c.inscricaoEstadual,
        status: c.status,
        statusLabel: statusLabel(c.status),
        statusTone: statusTone(c.status),
        segmento: c.segmento,
        limiteCredito: formatBrl(limite),
        creditoUsado: formatBrl(usado),
        creditoDisponivel: formatBrl(Math.max(0, limite - usado)),
        condicaoPagamento: c.condicaoPagamento,
        tabelaPrecoId: c.tabelaPrecoId,
        tabelaPrecoNome: c.tabelaPreco?.nome ?? null,
        contatosPrincipal: principal,
        totalContatos: c.contatos.length,
        totalEnderecos: c.enderecos.length,
        criadoEm: c.criadoEm.toISOString()
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar clientes: ${message}`);
  }
}

export async function getCustomerDetail(id: string): Promise<CustomerDetail | null> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();

    const c = await prisma.cliente.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
      include: {
        tabelaPreco: { select: { nome: true } },
        contatos: true,
        enderecos: true
      }
    });

    if (!c) return null;

    const limite = Number(c.limiteCredito);
    const usado = Number(c.creditoUsado);
    const principal = c.contatos.find((ct) => ct.principal)?.nome ?? c.contatos[0]?.nome ?? null;

    return {
      id: c.id,
      razaoSocial: c.razaoSocial,
      nomeFantasia: c.nomeFantasia,
      documento: c.documento,
      inscricaoEstadual: c.inscricaoEstadual,
      status: c.status,
      statusLabel: statusLabel(c.status),
      statusTone: statusTone(c.status),
      segmento: c.segmento,
      limiteCredito: formatBrl(limite),
      creditoUsado: formatBrl(usado),
      creditoDisponivel: formatBrl(Math.max(0, limite - usado)),
      condicaoPagamento: c.condicaoPagamento,
      tabelaPrecoId: c.tabelaPrecoId,
      tabelaPrecoNome: c.tabelaPreco?.nome ?? null,
      contatosPrincipal: principal,
      totalContatos: c.contatos.length,
      totalEnderecos: c.enderecos.length,
      criadoEm: c.criadoEm.toISOString(),
      contatos: c.contatos.map((ct) => ({
        id: ct.id,
        nome: ct.nome,
        email: ct.email,
        telefone: ct.telefone,
        whatsapp: ct.whatsapp,
        cargo: ct.cargo,
        principal: ct.principal
      })),
      enderecos: c.enderecos.map((e) => ({
        id: e.id,
        apelido: e.apelido,
        cep: e.cep,
        logradouro: e.logradouro,
        numero: e.numero,
        complemento: e.complemento,
        bairro: e.bairro,
        cidade: e.cidade,
        uf: e.uf,
        codigoMunicipioIbge: e.codigoMunicipioIbge,
        padrao: e.padrao
      }))
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar detalhes do cliente: ${message}`);
  }
}

export async function listTabelasPrecoOptions(): Promise<TabelaPrecoOption[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();

    const tabelas = await prisma.tabelaPreco.findMany({
      where: scopedByTenantCompany(scope),
      select: { id: true, nome: true },
      orderBy: { nome: "asc" }
    });

    return tabelas.map((t) => ({ id: t.id, nome: t.nome }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar tabelas de preço: ${message}`);
  }
}
