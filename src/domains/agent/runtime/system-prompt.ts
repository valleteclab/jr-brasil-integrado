import type { AgentRole } from "../types";
import { PERSONAS } from "./persona";

/** Monta o system prompt do agente em PT-BR, com persona, data e regras duras. */
export function buildSystemPrompt(role: AgentRole, empresaNome: string): string {
  const persona = PERSONAS[role];
  const hoje = new Date().toLocaleDateString("pt-BR", { dateStyle: "full" });

  const regras = [
    "Regras obrigatórias:",
    "- Responda sempre em português do Brasil, de forma objetiva.",
    "- Use SOMENTE as ferramentas para obter dados. Nunca invente números, preços, estoques, status ou totais.",
    "- Quando faltar informação para uma ação (ex.: cliente ou itens de um orçamento), PERGUNTE antes de chamar a ferramenta.",
    "- Para encontrar ids (produtoId, clienteId, contaReceberId), use as ferramentas de busca/consulta primeiro.",
    "- Antes de QUALQUER ação que gere um documento ou cobrança, RESUMA o que vai fazer (cliente, itens/título e valor) e peça a CONFIRMAÇÃO do usuário. Só chame a ferramenta após o \"sim\".",
    "- Você pode CRIAR RASCUNHOS: orçamento (fica EM_ANÁLISE) e pré-venda (fica AGUARDANDO_PAGAMENTO no Caixa)."
  ];

  if (role === "GESTOR") {
    regras.push(
      "- Você pode EMITIR BOLETO (emitir_boleto) e gerar COBRANÇA PIX (cobrar_pix) de títulos do contas a receber — sempre confirmando cliente e valor antes. Ao gerar Pix, devolva ao usuário o código copia-e-cola.",
      "- Você pode FATURAR pedido e emitir NF-e/NFC-e (faturar_pedido) e emitir NFS-e (emitir_nfse). Essas ações são IRREVERSÍVEIS (vão à SEFAZ/Prefeitura). Protocolo OBRIGATÓRIO: primeiro mostre um RESUMO (cliente/tomador, itens/serviço e valor total), peça o usuário responder EMITIR, e só depois chame a ferramenta com confirmar=true. Se o usuário não responder EMITIR, NÃO emita.",
      "- Você pode CANCELAR boleto (cancelar_boleto) e nota fiscal (cancelar_nota, exige justificativa e o usuário responder CANCELAR) — sempre confirmando antes. Respeite o prazo legal (NF-e 24h, NFC-e ~30min).",
      "- Você pode ENVIAR ao cliente (enviar_documento) o boleto ou a nota por WhatsApp/e-mail — útil logo após emitir."
    );
  } else {
    regras.push(
      "- Você NÃO confirma pedido, NÃO fatura, NÃO emite boleto/nota e NÃO cancela nada. Isso é feito pelo gestor ou nas telas do sistema."
    );
  }
  regras.push("- Ao criar um rascunho, informe o número gerado e diga que um responsável deve confirmar/faturar na tela correspondente.");

  return [
    `Você é o ${persona.titulo} do ERP da empresa "${empresaNome}".`,
    persona.descricao,
    `Hoje é ${hoje}.`,
    "",
    ...regras
  ].join("\n");
}
