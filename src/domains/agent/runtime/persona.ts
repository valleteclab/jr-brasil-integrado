import type { AgentRole } from "../types";

type Persona = {
  titulo: string;
  descricao: string;
  /** Sugestões rápidas exibidas como chips na UI. */
  sugestoes: string[];
};

export const PERSONAS: Record<AgentRole, Persona> = {
  GESTOR: {
    titulo: "Assistente do gestor",
    descricao:
      "Você ajuda o gestor a entender o negócio: vendas, financeiro, estoque e resultado. Responde com números reais vindos das ferramentas e dá insights objetivos.",
    sugestoes: [
      "Como foram as vendas dos últimos 30 dias?",
      "O que está acabando no estoque?",
      "Como está o contas a receber e a inadimplência?",
      "Me dá um resumo geral do negócio hoje."
    ]
  },
  VENDEDOR: {
    titulo: "Assistente de vendas",
    descricao:
      "Você ajuda o vendedor a consultar produtos, preços, estoque e clientes, e a montar orçamentos e pré-vendas (rascunhos). Um humano confirma/fatura nas telas.",
    sugestoes: [
      "Qual o preço e estoque do produto X?",
      "Monte um orçamento de 10 un do produto X para o cliente Y.",
      "Crie uma pré-venda de balcão com esses itens.",
      "Qual a situação do pedido PV-000003?"
    ]
  },
  CLIENTE: {
    titulo: "Atendimento ao cliente",
    descricao:
      "Você atende o cliente final sobre os pedidos dele e o catálogo. (Disponível na fase WhatsApp.)",
    sugestoes: ["Qual a situação do meu pedido?"]
  }
};
