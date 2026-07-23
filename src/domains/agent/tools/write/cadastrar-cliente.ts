import type { AgentTool } from "../../types";
import { prisma } from "@/lib/db/prisma";
import { createCustomer } from "@/domains/customers/application/customer-use-cases";
import { normalizeDocumento } from "@/lib/fiscal/documento";
import { lookupCnpj } from "@/lib/lookup/cadastro-lookup";

/**
 * Cadastra um cliente pelo CHAT — o desbloqueio do fluxo "vender/emitir agora para quem não está
 * cadastrado". Com CNPJ, o cadastro é AUTOMÁTICO: busca na Receita (BrasilAPI) e preenche razão
 * social, endereço completo (com IBGE), e-mail e telefone — o usuário só confirma. Com CPF,
 * pede o nome. Documento já cadastrado devolve o clienteId existente (não duplica).
 */
export const cadastrarCliente: AgentTool = {
  name: "cadastrar_cliente",
  description:
    "Cadastra um cliente novo (use quando consultar_cliente não encontrar e o usuário quiser vender/emitir para ele). Com CNPJ basta o documento: os dados (razão social, endereço, e-mail) vêm automaticamente da Receita — mostre o resumo e confirme com o usuário antes de cadastrar. Com CPF, peça também o nome. Se o documento já existir, devolve o cliente existente. Retorna o clienteId para usar em criar_pre_venda, criar_orcamento, emitir_nfse etc.",
  mode: "write",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      documento: { type: "string", description: "CPF ou CNPJ do cliente (obrigatório)." },
      nome: { type: "string", description: "Nome/razão social (obrigatório para CPF; para CNPJ é opcional — vem da Receita)." },
      email: { type: "string", description: "E-mail do cliente (opcional; sobrepõe o da Receita)." },
      telefone: { type: "string", description: "Telefone (opcional; sobrepõe o da Receita)." }
    },
    required: ["documento"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const documento = normalizeDocumento(String(args.documento ?? ""));
    if (documento.length !== 11 && documento.length !== 14) {
      return { ok: false, data: null, error: "Documento inválido — informe um CPF (11) ou CNPJ (14 dígitos)." };
    }

    // Já cadastrado? Devolve o existente (fluxo de chat segue sem duplicar).
    const existente = await prisma.cliente.findUnique({
      where: { tenantId_documento: { tenantId: scope.tenantId, documento } },
      select: { id: true, razaoSocial: true, nomeFantasia: true }
    });
    if (existente) {
      return {
        ok: true,
        data: { clienteId: existente.id, nome: existente.nomeFantasia ?? existente.razaoSocial, jaExistia: true }
      };
    }

    // CNPJ: autopreenche pela Receita (falha do lookup não trava — segue com o que foi informado).
    let nome = args.nome ? String(args.nome).trim() : "";
    let email = args.email ? String(args.email).trim() : "";
    let telefone = args.telefone ? String(args.telefone).trim() : "";
    let enderecos: Array<Record<string, unknown>> = [];
    let cidadeInfo = "";
    if (documento.length === 14) {
      try {
        const d = await lookupCnpj(documento);
        nome = nome || d.razaoSocial || "";
        email = email || d.email || "";
        telefone = telefone || d.telefone || "";
        if (d.endereco.cidade && d.endereco.uf) {
          cidadeInfo = `${d.endereco.cidade}/${d.endereco.uf}`;
          enderecos = [{
            apelido: "Principal",
            cep: d.endereco.cep ?? "",
            logradouro: d.endereco.logradouro ?? "",
            numero: d.endereco.numero ?? undefined,
            complemento: d.endereco.complemento ?? undefined,
            bairro: d.endereco.bairro ?? undefined,
            cidade: d.endereco.cidade,
            uf: d.endereco.uf,
            codigoMunicipioIbge: d.endereco.codigoMunicipioIbge ?? undefined,
            padrao: true
          }];
        }
      } catch { /* Receita fora do ar → segue com os dados informados */ }
    }
    if (!nome) {
      return { ok: false, data: null, error: documento.length === 11 ? "Para CPF, informe também o nome do cliente." : "Não consegui obter a razão social na Receita — informe o nome do cliente." };
    }

    try {
      const cliente = await createCustomer(scope, {
        razaoSocial: nome,
        documento,
        status: "ATIVO",
        contatos: email || telefone ? [{ nome, email: email || undefined, telefone: telefone || undefined, principal: true }] : [],
        enderecos: enderecos as never
      });
      return {
        ok: true,
        data: { clienteId: cliente.id, nome, cidade: cidadeInfo || undefined, jaExistia: false }
      };
    } catch (e) {
      return { ok: false, data: null, error: e instanceof Error ? e.message : "Falha ao cadastrar o cliente." };
    }
  }
};
