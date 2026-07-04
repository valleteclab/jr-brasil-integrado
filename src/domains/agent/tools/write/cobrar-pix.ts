import type { AgentTool } from "../../types";
import { criarPixCobranca, listContasComPix } from "@/domains/finance/application/pix-use-cases";

export const cobrarPix: AgentTool = {
  name: "cobrar_pix",
  description:
    "Gera uma cobrança PIX (QR Code dinâmico) e devolve o código copia-e-cola (BR Code) para enviar ao cliente. Sempre informe o valor. Opcionalmente informe o contaReceberId (de consultar_contas_receber) para dar BAIXA AUTOMÁTICA no título quando o cliente pagar. Confirme o valor ANTES. Se contaBancariaId não for informada, usa a primeira conta com chave Pix.",
  mode: "write",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      valor: { type: "number", description: "Valor da cobrança (obrigatório; para um título use o valorEmAberto retornado por consultar_contas_receber)." },
      contaReceberId: { type: "string", description: "Id do título a vincular (opcional; se informado, a baixa é automática ao pagar)." },
      descricao: { type: "string", description: "Descrição da cobrança (aparece para o pagador)." },
      contaBancariaId: { type: "string", description: "Id da conta recebedora com chave Pix (opcional; padrão = primeira com Pix)." }
    },
    required: ["valor"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const contaReceberId = args.contaReceberId ? String(args.contaReceberId) : null;
    const valor = args.valor != null ? Number(args.valor) : null;
    if (!(valor && valor > 0)) {
      return { ok: false, data: null, error: "Informe um valor maior que zero para a cobrança." };
    }

    let contaBancariaId = args.contaBancariaId ? String(args.contaBancariaId) : "";
    if (!contaBancariaId) {
      const contas = await listContasComPix(scope);
      if (!contas.length) {
        return { ok: false, data: null, error: "Nenhuma conta com chave Pix + credenciamento configurado (Configurações → Contas financeiras)." };
      }
      contaBancariaId = contas[0].id;
    }

    try {
      const pix = await criarPixCobranca(scope, {
        contaBancariaId,
        valor,
        descricao: args.descricao ? String(args.descricao) : null,
        contaReceberId
      });
      return {
        ok: true,
        data: {
          txid: pix.txid,
          brcode: pix.brcode,
          valor: pix.valor,
          status: pix.status,
          aviso: pix.aviso
        }
      };
    } catch (e) {
      return { ok: false, data: null, error: e instanceof Error ? e.message : "Falha ao gerar a cobrança Pix." };
    }
  }
};
