/**
 * Traduz códigos/mensagens de rejeição fiscal (SEFAZ, prefeitura, Ambiente Nacional NFS-e e
 * validações do provedor Spedy) para um texto amigável em PT-BR, com orientação ao usuário.
 * Mantém a mensagem técnica original como complemento para rastreio.
 */

type FriendlyEntry = { titulo: string; orientacao: string };

const POR_CODIGO: Record<string, FriendlyEntry> = {
  // Spedy / assinatura e ambiente
  E0717: {
    titulo: "Documento não assinado.",
    orientacao: "O certificado digital A1 da empresa não assinou a nota. Verifique em Configurações › Emissão fiscal se o certificado foi enviado, está válido e pertence ao mesmo CNPJ/ambiente da emissão."
  },
  SPD005: {
    titulo: "Município sem ambiente de homologação.",
    orientacao: "A prefeitura emitente não disponibiliza homologação para NFS-e. Emita em ambiente de Produção para validar com a prefeitura."
  },
  // NFS-e Nacional — schema do tomador
  E1235: {
    titulo: "Dados do tomador inválidos para o padrão Nacional.",
    orientacao: "Confira o CNPJ/CPF e o nome do tomador. Para tomador identificado, o Ambiente Nacional dispensa endereço/e-mail no bloco do tomador."
  },
  // NFS-e — município do prestador
  E125: {
    titulo: "Código do município do prestador não encontrado.",
    orientacao: "Revise o código IBGE do município da empresa em Configurações › Emissão fiscal."
  },
  // Validação de schema da SEFAZ (campo inválido/ausente/fora de ordem) reportada pela Spedy
  SPD003: {
    titulo: "Dado obrigatório ausente ou inválido na nota.",
    orientacao: "Revise os campos do item e do destinatário (NCM do produto, endereço completo) conforme a mensagem técnica."
  }
};

/** Heurística por palavras-chave quando não há código mapeado. */
function porTexto(message: string): FriendlyEntry | null {
  const m = message.toLowerCase();
  if (m.includes("assinatura")) return POR_CODIGO.E0717;
  if (m.includes("homologa")) return POR_CODIGO.SPD005;
  if (m.includes("certificad")) {
    return { titulo: "Problema com o certificado digital.", orientacao: "Verifique o certificado A1 em Configurações › Emissão fiscal (envio, validade e CNPJ)." };
  }
  if (m.includes(" inscri") && m.includes("estadual")) {
    return { titulo: "Inscrição Estadual exigida.", orientacao: "Informe a Inscrição Estadual da empresa para emitir NF-e." };
  }
  if (m.includes("cnpj") || m.includes("cpf")) {
    return { titulo: "Documento do destinatário inválido.", orientacao: "Confira o CNPJ/CPF informado (apenas números, com dígitos válidos)." };
  }
  if (m.includes("ncm")) return { titulo: "NCM obrigatório no produto.", orientacao: "Informe o NCM (8 dígitos) no cadastro do produto ou no item da nota." };
  if (m.includes("cfop")) return { titulo: "CFOP inválido.", orientacao: "Revise o CFOP do item conforme a operação (interna/interestadual)." };
  if (m.includes("logradouro") || (m.includes("endere") && m.includes("inv"))) {
    return { titulo: "Endereço do destinatário incompleto.", orientacao: "Informe logradouro, número, bairro e CEP válidos do destinatário (campos com tamanho mínimo exigido pela SEFAZ)." };
  }
  if (m.includes("abaixo do tamanho") || m.includes("tamanho mínimo") || m.includes("tamanho minimo")) {
    return { titulo: "Campo abaixo do tamanho mínimo.", orientacao: "Algum campo de texto (ex.: logradouro, descrição) está curto demais para a SEFAZ. Complete a informação." };
  }
  return null;
}

/**
 * Monta a mensagem amigável a partir do código e/ou texto técnico.
 * Ex.: "Documento não assinado. O certificado digital… (E0717: A assinatura é obrigatória…)".
 */
export function friendlyFiscalMessage(code: string | null | undefined, message: string | null | undefined): string | undefined {
  const technical = (message ?? "").trim();
  const codeKey = (code ?? "").trim().toUpperCase();
  const entry = (codeKey && POR_CODIGO[codeKey]) || porTexto(technical);

  if (!entry) {
    // Sem mapeamento: devolve o técnico (com código quando houver).
    if (!technical) return code ? `Rejeição ${code}.` : undefined;
    return code ? `${technical} (${code})` : technical;
  }

  const detalhe = [code, technical].filter(Boolean).join(": ");
  return detalhe ? `${entry.titulo} ${entry.orientacao} (${detalhe})` : `${entry.titulo} ${entry.orientacao}`;
}
