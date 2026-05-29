import type { ProvedorFiscal } from "@prisma/client";
import type {
  CancelInput,
  CancelResult,
  CorrectionInput,
  CorrectionResult,
  EmitInput,
  EmitResult,
  FiscalProvider,
  ProviderContext
} from "./types";

/**
 * Adapter HTTP genérico para provedores REST de emissão (Focus NFe, NFe.io, PlugNotas,
 * WebmaniaBR). A forma do payload segue o padrão REST mais comum no mercado
 * (referência própria + JSON da nota). Para ativar em produção basta cadastrar `baseUrl`
 * e `token` na Configuração Fiscal da empresa e selecionar o provedor correspondente.
 *
 * A normalização específica de cada provedor (nomes de campos) deve ser ajustada no
 * método `mapPayload` conforme a documentação do provedor escolhido — o restante do
 * fluxo (numeração, tributos, persistência, baixa de estoque, contas a receber) já é
 * agnóstico de provedor.
 */
export class HttpFiscalProvider implements FiscalProvider {
  readonly id: ProvedorFiscal;

  constructor(id: ProvedorFiscal) {
    this.id = id;
  }

  private requireConfig(ctx: ProviderContext) {
    if (!ctx.baseUrl || !ctx.token) {
      throw new Error(
        "Provedor fiscal externo selecionado, mas baseUrl/token não configurados. Configure em Configurações › Fiscal."
      );
    }
    return { baseUrl: ctx.baseUrl.replace(/\/$/, ""), token: ctx.token };
  }

  private headers(token: string) {
    // Padrão Focus NFe: Basic com token como usuário. Ajustar conforme provedor.
    const basic = Buffer.from(`${token}:`).toString("base64");
    return {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json"
    };
  }

  private mapPayload(input: EmitInput) {
    return {
      natureza_operacao: input.document.naturezaOperacao,
      serie: input.document.serie,
      numero: input.numero,
      tipo_documento: 1,
      finalidade_emissao: input.document.finalidade === "NORMAL" ? 1 : input.document.finalidade === "COMPLEMENTAR" ? 2 : input.document.finalidade === "AJUSTE" ? 3 : 4,
      cnpj_emitente: input.emitter.cnpj.replace(/\D/g, ""),
      nome_destinatario: input.document.destinatario.nome,
      cpf_cnpj_destinatario: input.document.destinatario.documento?.replace(/\D/g, "") ?? null,
      inscricao_estadual_destinatario: input.document.destinatario.inscricaoEstadual,
      email_destinatario: input.document.destinatario.email,
      valor_frete: input.document.valorFrete,
      valor_seguro: input.document.valorSeguro,
      valor_desconto: input.document.valorDesconto,
      valor_outras_despesas: input.document.outrasDespesas,
      valor_total: input.total,
      informacoes_adicionais_contribuinte: input.document.informacoesComplementares,
      items: input.document.itens.map((item, index) => ({
        numero_item: index + 1,
        codigo_produto: item.codigo,
        descricao: item.descricao,
        cfop: item.cfop,
        unidade_comercial: item.unidade,
        quantidade_comercial: item.quantidade,
        valor_unitario_comercial: item.valorUnitario,
        valor_bruto: item.valorTotal,
        ncm: item.ncm,
        cest: item.cest
      }))
    };
  }

  async emit(input: EmitInput, ctx: ProviderContext): Promise<EmitResult> {
    const { baseUrl, token } = this.requireConfig(ctx);
    const ref = `nf-${input.document.modelo.toLowerCase()}-${input.numero}-${Date.now()}`;
    const resource = input.document.modelo === "NFSE" ? "nfse" : "nfe";

    const response = await fetch(`${baseUrl}/v2/${resource}?ref=${encodeURIComponent(ref)}`, {
      method: "POST",
      headers: this.headers(token),
      body: JSON.stringify(this.mapPayload(input))
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return {
        status: "ERRO",
        providerRef: ref,
        motivo: typeof data?.mensagem === "string" ? data.mensagem : `Provedor retornou HTTP ${response.status}.`
      };
    }

    const status = String(data?.status ?? "");
    const mapped: EmitResult["status"] =
      status === "autorizado" ? "AUTORIZADA" : status === "processando_autorizacao" ? "PROCESSANDO" : status === "erro_autorizacao" || status === "rejeitado" ? "REJEITADA" : "PROCESSANDO";

    return {
      status: mapped,
      providerRef: ref,
      chaveAcesso: typeof data?.chave_nfe === "string" ? data.chave_nfe : undefined,
      protocolo: typeof data?.numero_protocolo === "string" ? data.numero_protocolo : undefined,
      xmlUrl: typeof data?.caminho_xml_nota_fiscal === "string" ? data.caminho_xml_nota_fiscal : undefined,
      danfeUrl: typeof data?.caminho_danfe === "string" ? data.caminho_danfe : undefined,
      motivo: typeof data?.mensagem_sefaz === "string" ? data.mensagem_sefaz : undefined
    };
  }

  async cancel(input: CancelInput, ctx: ProviderContext): Promise<CancelResult> {
    const { baseUrl, token } = this.requireConfig(ctx);
    if (!input.providerRef) {
      return { status: "ERRO", motivo: "Referência do provedor ausente para cancelamento." };
    }
    const resource = input.modelo === "NFSE" ? "nfse" : "nfe";
    const response = await fetch(`${baseUrl}/v2/${resource}/${encodeURIComponent(input.providerRef)}`, {
      method: "DELETE",
      headers: this.headers(token),
      body: JSON.stringify({ justificativa: input.justificativa })
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return { status: "ERRO", motivo: typeof data?.mensagem === "string" ? data.mensagem : `HTTP ${response.status}.` };
    }
    return { status: "AUTORIZADO", protocolo: typeof data?.numero_protocolo === "string" ? data.numero_protocolo : undefined };
  }

  async correct(input: CorrectionInput, ctx: ProviderContext): Promise<CorrectionResult> {
    const { baseUrl, token } = this.requireConfig(ctx);
    if (!input.providerRef) {
      return { status: "ERRO", motivo: "Referência do provedor ausente para carta de correção." };
    }
    const response = await fetch(`${baseUrl}/v2/nfe/${encodeURIComponent(input.providerRef)}/carta_correcao`, {
      method: "POST",
      headers: this.headers(token),
      body: JSON.stringify({ correcao: input.correcao })
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return { status: "ERRO", motivo: typeof data?.mensagem === "string" ? data.mensagem : `HTTP ${response.status}.` };
    }
    return { status: "AUTORIZADO", protocolo: typeof data?.numero_protocolo === "string" ? data.numero_protocolo : undefined };
  }

  async queryStatus(chaveAcesso: string, ctx: ProviderContext): Promise<EmitResult> {
    const { baseUrl, token } = this.requireConfig(ctx);
    const response = await fetch(`${baseUrl}/v2/nfe/${encodeURIComponent(chaveAcesso)}`, {
      method: "GET",
      headers: this.headers(token)
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const status = String(data?.status ?? "");
    const mapped: EmitResult["status"] = status === "autorizado" ? "AUTORIZADA" : status === "cancelado" ? "CANCELADA" : "PROCESSANDO";
    return { status: mapped, chaveAcesso, motivo: typeof data?.mensagem_sefaz === "string" ? data.mensagem_sefaz : undefined };
  }
}
