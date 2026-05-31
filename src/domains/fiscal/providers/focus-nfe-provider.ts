import type { AmbienteFiscal, ProvedorFiscal, RegimeTributario, StatusNotaFiscal } from "@prisma/client";
import type {
  CancelInput,
  CancelResult,
  CorrectionInput,
  CorrectionResult,
  EmitInput,
  EmitResult,
  FiscalProvider,
  ProviderContext,
  TestConnectionResult
} from "./types";

/**
 * Provedor fiscal Focus NFe (https://doc.focusnfe.com.br) para NF-e, NFC-e e NFS-e.
 *
 * Características da API que moldam esta implementação:
 *  - Autenticação HTTP Basic com o token como usuário e senha em branco.
 *  - Cada documento é identificado por uma `ref` (nossa), enviada na query string e
 *    usada depois para consultar, cancelar e corrigir. Guardamos a `ref` em
 *    `providerRef` da NotaFiscal.
 *  - Emissão de NF-e e NFS-e é ASSÍNCRONA: o POST devolve `processando_autorizacao`
 *    (HTTP 202) e a autorização é confirmada consultando `GET /v2/{recurso}/{ref}`.
 *    NFC-e é síncrona (autoriza/rejeita no próprio POST).
 *  - Os dados do emitente (endereço, IE, regime) vêm do cadastro da empresa na Focus;
 *    enviamos apenas o `cnpj_emitente` para identificá-lo.
 *
 * O restante do fluxo (numeração, cálculo de tributos, persistência, estoque, contas a
 * receber, auditoria) é agnóstico de provedor — só esta classe conhece a Focus.
 */

const FOCUS_BASE_URL: Record<AmbienteFiscal, string> = {
  PRODUCAO: "https://api.focusnfe.com.br/v2",
  HOMOLOGACAO: "https://homologacao.focusnfe.com.br/v2"
};

/** Recurso REST da Focus por modelo de documento. */
const FOCUS_RESOURCE = { NFE: "nfe", NFCE: "nfce", NFSE: "nfse" } as const;

/** Resposta de erro da Focus: { codigo, mensagem, erros: [{ campo, mensagem }] }. */
type FocusErrorResponse = {
  codigo?: string;
  mensagem?: string;
  erros?: Array<{ campo?: string; mensagem?: string }>;
};

/** Resposta de consulta/emissão da Focus (campos variam por modelo). */
type FocusInvoiceResponse = {
  status?: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  mensagem?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  numero_protocolo?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  caminho_xml?: string;
  url?: string;
  qrcode_url?: string;
  codigo_verificacao?: string;
  erros?: Array<{ campo?: string; mensagem?: string }>;
};

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** True para regimes do Simples Nacional (incluindo MEI e excesso de sublimite). */
function isSimplesRegime(regime: RegimeTributario): boolean {
  return regime === "SIMPLES_NACIONAL" || regime === "MEI" || regime === "SIMPLES_EXCESSO_SUBLIMITE";
}

/** Código do regime tributário do emitente para a Focus (1=Simples, 2=excesso, 3=Normal). */
function regimeFocus(regime: RegimeTributario): number {
  if (regime === "SIMPLES_NACIONAL" || regime === "MEI") return 1;
  if (regime === "SIMPLES_EXCESSO_SUBLIMITE") return 2;
  return 3;
}

/** finalidade_emissao da Focus (1=normal, 2=complementar, 3=ajuste, 4=devolução). */
function finalidadeFocus(finalidade: EmitInput["document"]["finalidade"]): number {
  switch (finalidade) {
    case "COMPLEMENTAR":
      return 2;
    case "AJUSTE":
      return 3;
    case "DEVOLUCAO":
      return 4;
    default:
      return 1;
  }
}

/** Mapeia status textual da Focus para o StatusNotaFiscal interno. */
function mapStatus(status: string | null | undefined): StatusNotaFiscal {
  switch ((status ?? "").toLowerCase()) {
    case "autorizado":
      return "AUTORIZADA";
    case "cancelado":
      return "CANCELADA";
    case "denegado":
      return "DENEGADA";
    case "erro_autorizacao":
    case "rejeitado":
      return "REJEITADA";
    case "processando_autorizacao":
    case "enviada":
    case "processando":
      return "PROCESSANDO";
    default:
      return "PROCESSANDO";
  }
}

/** Estados finais (não há mais o que aguardar no polling). */
function isFinalStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "autorizado" || s === "cancelado" || s === "denegado" || s === "erro_autorizacao" || s === "rejeitado";
}

/** Forma de pagamento da NFC-e — códigos da Focz/SEFAZ (tPag): 01=dinheiro, 03=crédito... */
function mapPaymentMethodFocus(forma: string | null): string {
  const f = (forma ?? "").toLowerCase();
  if (f.includes("pix")) return "17";
  if (f.includes("credito") || f.includes("crédito") || f.includes("credit")) return "03";
  if (f.includes("debito") || f.includes("débito") || f.includes("debit")) return "04";
  if (f.includes("boleto") || f.includes("billet")) return "15";
  if (f.includes("transfer")) return "16";
  if (f.includes("dinheiro") || f.includes("cash") || f.includes("especie") || f.includes("espécie")) return "01";
  return "99"; // outros
}

/** Promise de espera não-bloqueante. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FocusNfeProvider implements FiscalProvider {
  readonly id: ProvedorFiscal;

  constructor(id: ProvedorFiscal = "FOCUS_NFE") {
    this.id = id;
  }

  // -------------------------------------------------------------------------
  // Cliente HTTP.
  // -------------------------------------------------------------------------

  /** Resolve baseUrl (override do contexto > ambiente) e exige token. */
  private resolveConfig(ctx: ProviderContext): { baseUrl: string; token: string; origin: string } {
    const token = ctx.token?.trim();
    if (!token) {
      throw new Error(
        "Provedor Focus NFe selecionado, mas a chave de API (token) não está configurada. Configure em Configurações › Fiscal."
      );
    }
    const baseUrl = (ctx.baseUrl?.trim() || FOCUS_BASE_URL[ctx.ambiente]).replace(/\/$/, "");
    // Origin (sem o /v2) para compor URLs absolutas de XML/DANFE que a Focus devolve relativas.
    const origin = baseUrl.replace(/\/v2$/, "");
    return { baseUrl, token, origin };
  }

  private authHeader(token: string): string {
    return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
  }

  /** Faz uma chamada à API. Trata 429, erros HTTP e JSON malformado. Nunca loga o token. */
  private async request<T>(
    ctx: ProviderContext,
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<{ ok: boolean; status: number; data: T | undefined; errorMessage: string | null }> {
    const { baseUrl, token } = this.resolveConfig(ctx);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: this.authHeader(token),
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "erro desconhecido";
      throw new Error(`Falha de comunicação com a Focus NFe: ${reason}`);
    }

    const raw = await response.text().catch(() => "");
    let data: unknown = undefined;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = undefined;
      }
    }

    let errorMessage: string | null = null;
    if (!response.ok) {
      if (response.status === 429) {
        errorMessage = "Limite de requisições da Focus NFe excedido (HTTP 429). Tente novamente em instantes.";
      } else {
        const err = data as FocusErrorResponse | undefined;
        const firstErro = err?.erros?.[0]?.mensagem;
        errorMessage = err?.mensagem ?? firstErro ?? `Focus NFe retornou HTTP ${response.status}.`;
      }
    }

    return { ok: response.ok, status: response.status, data: data as T | undefined, errorMessage };
  }

  // -------------------------------------------------------------------------
  // Emissão.
  // -------------------------------------------------------------------------

  async emit(input: EmitInput, ctx: ProviderContext): Promise<EmitResult> {
    const modelo = input.document.modelo;
    const resource = FOCUS_RESOURCE[modelo];
    // ref determinística por documento (modelo+série+número) — idempotente em retentativas.
    const ref = `${modelo}-${input.document.serie || "1"}-${input.numero}`.toLowerCase();
    const body =
      modelo === "NFSE"
        ? this.buildNfseBody(input)
        : modelo === "NFCE"
          ? this.buildNfceBody(input)
          : this.buildNfeBody(input);

    const posted = await this.request<FocusInvoiceResponse>(
      ctx,
      "POST",
      `/${resource}?ref=${encodeURIComponent(ref)}`,
      body
    );

    if (!posted.ok && posted.status !== 422) {
      // 422 já costuma trazer o JSON com status de rejeição — segue para mapeamento abaixo.
      return { status: "ERRO", providerRef: ref, motivo: posted.errorMessage ?? "Falha ao enviar à Focus NFe." };
    }

    let result = this.toEmitResult(posted.data, ref, ctx);

    // NF-e/NFS-e são assíncronas: consulta até estado final ou esgotar as tentativas.
    if (result.status === "PROCESSANDO" && modelo !== "NFCE") {
      result = await this.pollUntilFinal(ctx, resource, ref);
    }
    return result;
  }

  /** Consulta GET /{recurso}/{ref} até estado final (5 tentativas, 3s de intervalo). */
  private async pollUntilFinal(ctx: ProviderContext, resource: string, ref: string): Promise<EmitResult> {
    let last: EmitResult = { status: "PROCESSANDO", providerRef: ref };
    for (let attempt = 0; attempt < 5; attempt++) {
      await delay(3000);
      const res = await this.request<FocusInvoiceResponse>(ctx, "GET", `/${resource}/${encodeURIComponent(ref)}`);
      if (!res.ok || !res.data) continue;
      last = this.toEmitResult(res.data, ref, ctx);
      if (isFinalStatus(res.data.status)) break;
    }
    return last;
  }

  /** Converte a resposta da Focus em EmitResult, normalizando URLs de XML/DANFE. */
  private toEmitResult(data: FocusInvoiceResponse | undefined, ref: string, ctx: ProviderContext): EmitResult {
    const { origin } = this.resolveConfig(ctx);
    const toAbsolute = (path: string | undefined): string | undefined => {
      if (!path) return undefined;
      if (/^https?:\/\//i.test(path)) return path;
      return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
    };

    const motivo =
      data?.mensagem_sefaz ?? data?.mensagem ?? data?.erros?.map((e) => e.mensagem).filter(Boolean).join("; ") ?? undefined;

    return {
      status: mapStatus(data?.status),
      providerRef: ref,
      chaveAcesso: data?.chave_nfe || undefined,
      protocolo: data?.numero_protocolo || data?.codigo_verificacao || undefined,
      xmlUrl: toAbsolute(data?.caminho_xml_nota_fiscal || data?.caminho_xml),
      danfeUrl: toAbsolute(data?.caminho_danfe),
      motivo: motivo || undefined
    };
  }

  // -------------------------------------------------------------------------
  // Construção dos corpos por modelo.
  // -------------------------------------------------------------------------

  /** Bloco de itens de mercadoria (NF-e/NFC-e) com tributos calculados. */
  private buildMercadoriaItems(input: EmitInput): Record<string, unknown>[] {
    const simples = isSimplesRegime(input.emitter.regime);
    return input.document.itens.map((item, index) => {
      const numeroItem = index + 1;
      const taxes = input.computed.find((c) => c.numeroItem === numeroItem)?.taxes;
      const origem = taxes?.origem ?? item.origem ?? "0";
      const baseItem: Record<string, unknown> = {
        numero_item: numeroItem,
        codigo_produto: item.codigo,
        descricao: item.descricao,
        cfop: item.cfop ?? undefined,
        codigo_ncm: item.ncm ?? undefined,
        cest: item.cest ?? undefined,
        unidade_comercial: item.unidade,
        quantidade_comercial: item.quantidade,
        valor_unitario_comercial: item.valorUnitario,
        unidade_tributavel: item.unidade,
        quantidade_tributavel: item.quantidade,
        valor_unitario_tributavel: item.valorUnitario,
        valor_bruto: item.valorTotal,
        valor_desconto: item.desconto || undefined,
        inclui_no_total: 1,
        icms_origem: Number(origem) || 0
      };

      if (simples) {
        // Simples Nacional: CSOSN.
        baseItem.icms_situacao_tributaria = taxes?.csosn ?? "102";
      } else {
        // Regime Normal: CST de ICMS com base/alíquota/valor.
        baseItem.icms_situacao_tributaria = taxes?.cstIcms ?? "00";
        baseItem.icms_modalidade_base_calculo = 3; // 3 = valor da operação
        baseItem.icms_base_calculo = taxes?.baseIcms ?? 0;
        baseItem.icms_aliquota = taxes?.aliquotaIcms ?? 0;
        baseItem.icms_valor = taxes?.valorIcms ?? 0;
      }

      // PIS/COFINS: CST + base/alíquota(%)/valor.
      baseItem.pis_situacao_tributaria = taxes?.cstPis ?? (simples ? "49" : "01");
      baseItem.cofins_situacao_tributaria = taxes?.cstCofins ?? (simples ? "49" : "01");
      if (!simples) {
        const base = item.valorTotal - item.desconto;
        baseItem.pis_base_calculo = base;
        baseItem.pis_aliquota_porcentual = taxes?.aliquotaPis ?? 0;
        baseItem.pis_valor = taxes?.valorPis ?? 0;
        baseItem.cofins_base_calculo = base;
        baseItem.cofins_aliquota_porcentual = taxes?.aliquotaCofins ?? 0;
        baseItem.cofins_valor = taxes?.valorCofins ?? 0;
      }
      return baseItem;
    });
  }

  /** Campos do destinatário (flat) para NF-e. */
  private destinatarioFields(input: EmitInput): Record<string, unknown> {
    const dest = input.document.destinatario;
    const doc = onlyDigits(dest.documento);
    const end = dest.endereco;
    const fields: Record<string, unknown> = {
      nome_destinatario: dest.nome,
      inscricao_estadual_destinatario: dest.inscricaoEstadual ?? undefined,
      // 1=contribuinte ICMS, 2=isento, 9=não contribuinte.
      indicador_inscricao_estadual_destinatario: dest.inscricaoEstadual ? 1 : 9,
      email_destinatario: dest.email ?? undefined
    };
    if (doc.length === 14) fields.cnpj_destinatario = doc;
    else if (doc.length === 11) fields.cpf_destinatario = doc;
    if (end) {
      fields.logradouro_destinatario = end.logradouro ?? undefined;
      fields.numero_destinatario = end.numero ?? undefined;
      fields.bairro_destinatario = end.bairro ?? undefined;
      fields.municipio_destinatario = end.cidade ?? undefined;
      fields.uf_destinatario = end.uf ?? dest.uf ?? undefined;
      const cep = onlyDigits(end.cep);
      if (cep.length === 8) fields.cep_destinatario = cep;
    }
    return fields;
  }

  private buildNfeBody(input: EmitInput): Record<string, unknown> {
    const ufEmit = input.emitter.uf?.toUpperCase() ?? null;
    const ufDest = (input.document.destinatario.endereco?.uf ?? input.document.destinatario.uf)?.toUpperCase() ?? null;
    const localDestino = ufEmit && ufDest && ufEmit !== ufDest ? 2 : 1;

    return {
      natureza_operacao: input.document.naturezaOperacao,
      data_emissao: new Date().toISOString(),
      tipo_documento: 1, // saída
      finalidade_emissao: finalidadeFocus(input.document.finalidade),
      cnpj_emitente: onlyDigits(input.emitter.cnpj),
      regime_tributario_emitente: regimeFocus(input.emitter.regime),
      local_destino: localDestino,
      ...this.destinatarioFields(input),
      valor_frete: input.document.valorFrete || undefined,
      valor_seguro: input.document.valorSeguro || undefined,
      valor_desconto: input.document.valorDesconto || undefined,
      valor_outras_despesas: input.document.outrasDespesas || undefined,
      valor_total: input.total,
      valor_produtos: input.totals.valorProdutos,
      informacoes_adicionais_contribuinte: input.document.informacoesComplementares ?? undefined,
      items: this.buildMercadoriaItems(input)
    };
  }

  private buildNfceBody(input: EmitInput): Record<string, unknown> {
    return {
      natureza_operacao: input.document.naturezaOperacao || "VENDA AO CONSUMIDOR",
      data_emissao: new Date().toISOString(),
      tipo_documento: 1,
      finalidade_emissao: finalidadeFocus(input.document.finalidade),
      cnpj_emitente: onlyDigits(input.emitter.cnpj),
      regime_tributario_emitente: regimeFocus(input.emitter.regime),
      local_destino: 1, // NFC-e é sempre operação interna
      presenca_comprador: 1, // operação presencial
      consumidor_final: 1,
      modalidade_frete: 9, // sem frete
      // Destinatário é opcional na NFC-e; envia CPF/nome só quando informado.
      ...(onlyDigits(input.document.destinatario.documento) ? this.destinatarioFields(input) : {}),
      valor_desconto: input.document.valorDesconto || undefined,
      valor_total: input.total,
      valor_produtos: input.totals.valorProdutos,
      informacoes_adicionais_contribuinte: input.document.informacoesComplementares ?? undefined,
      formas_pagamento: [
        {
          forma_pagamento: mapPaymentMethodFocus(input.document.formaPagamento),
          valor_pagamento: input.total
        }
      ],
      items: this.buildMercadoriaItems(input)
    };
  }

  private buildNfseBody(input: EmitInput): Record<string, unknown> {
    const dest = input.document.destinatario;
    const end = dest.endereco;
    const doc = onlyDigits(dest.documento);
    const simples = isSimplesRegime(input.emitter.regime);

    // Item de serviço de referência (ISS / item da lista LC116).
    const servicoTax = input.computed.find((c) => c.taxes.aliquotaIss > 0 || c.taxes.itemListaServico != null)?.taxes;
    const aliquotaIss = servicoTax?.aliquotaIss ?? 0;
    const itemListaServico = servicoTax?.itemListaServico ?? undefined;
    const discriminacao =
      input.document.informacoesComplementares?.trim() ||
      input.document.itens.map((i) => i.descricao).join("; ") ||
      input.document.naturezaOperacao;

    const tomador: Record<string, unknown> = {
      razao_social: dest.nome,
      email: dest.email ?? undefined
    };
    if (doc.length === 14) tomador.cnpj = doc;
    else if (doc.length === 11) tomador.cpf = doc;
    if (end) {
      const cep = onlyDigits(end.cep);
      tomador.endereco = {
        logradouro: end.logradouro ?? undefined,
        numero: end.numero ?? undefined,
        bairro: end.bairro ?? undefined,
        codigo_municipio: end.codigoMunicipioIbge ?? undefined,
        uf: end.uf ?? dest.uf ?? undefined,
        cep: cep.length === 8 ? cep : undefined
      };
    }

    const ret = input.document.retencoes ?? null;
    const servico: Record<string, unknown> = {
      valor_servicos: input.totals.valorServicos || input.total,
      discriminacao,
      iss_retido: ret?.issRetido ?? false,
      item_lista_servico: itemListaServico,
      aliquota: aliquotaIss / 100, // Focus usa fração (ex.: 0.05 para 5%)
      valor_iss: input.totals.valorIss || undefined,
      codigo_municipio: input.emitter.codigoMunicipioIbge ?? undefined
    };
    // Retenções federais na fonte, quando houver.
    if (ret?.ir) servico.valor_ir = ret.ir.valor;
    if (ret?.pis) servico.valor_pis = ret.pis.valor;
    if (ret?.cofins) servico.valor_cofins = ret.cofins.valor;
    if (ret?.csll) servico.valor_csll = ret.csll.valor;
    if (ret?.inss) servico.valor_inss = ret.inss.valor;

    return {
      data_emissao: new Date().toISOString(),
      natureza_operacao: "1",
      optante_simples_nacional: simples,
      prestador: {
        cnpj: onlyDigits(input.emitter.cnpj),
        inscricao_municipal: input.emitter.inscricaoMunicipal ?? undefined,
        codigo_municipio: input.emitter.codigoMunicipioIbge ?? undefined
      },
      tomador,
      servico
    };
  }

  // -------------------------------------------------------------------------
  // Cancelamento, carta de correção e consulta.
  // -------------------------------------------------------------------------

  async cancel(input: CancelInput, ctx: ProviderContext): Promise<CancelResult> {
    if (!input.providerRef) {
      return { status: "ERRO", motivo: "Referência da Focus (ref) ausente para cancelamento." };
    }
    const resource = FOCUS_RESOURCE[input.modelo];
    const res = await this.request<FocusInvoiceResponse>(
      ctx,
      "DELETE",
      `/${resource}/${encodeURIComponent(input.providerRef)}`,
      { justificativa: input.justificativa }
    );
    if (!res.ok) {
      return { status: "ERRO", motivo: res.errorMessage ?? "Falha ao cancelar na Focus NFe." };
    }
    const status = (res.data?.status ?? "").toLowerCase();
    if (status === "cancelado" || status === "processando_cancelamento") {
      return { status: "AUTORIZADO", protocolo: res.data?.numero_protocolo || undefined };
    }
    return { status: "REJEITADO", motivo: res.data?.mensagem_sefaz ?? res.data?.mensagem ?? undefined };
  }

  async correct(input: CorrectionInput, ctx: ProviderContext): Promise<CorrectionResult> {
    if (!input.providerRef) {
      return { status: "ERRO", motivo: "Referência da Focus (ref) ausente para carta de correção." };
    }
    // Carta de correção é exclusiva de NF-e.
    const res = await this.request<FocusInvoiceResponse>(
      ctx,
      "POST",
      `/nfe/${encodeURIComponent(input.providerRef)}/carta_correcao`,
      { correcao: input.correcao }
    );
    if (!res.ok) {
      return { status: "ERRO", motivo: res.errorMessage ?? "Falha ao registrar carta de correção na Focus NFe." };
    }
    return { status: "AUTORIZADO", protocolo: res.data?.numero_protocolo || undefined };
  }

  /**
   * Ping autenticado: consulta uma ref inexistente. 401/403 ⇒ token inválido;
   * qualquer outra resposta (incl. 404) ⇒ as credenciais autenticaram.
   */
  async testConnection(ctx: ProviderContext): Promise<TestConnectionResult> {
    const { baseUrl } = this.resolveConfig(ctx); // valida token presente (lança se faltar)
    const res = await this.request<FocusInvoiceResponse>(ctx, "GET", `/nfe/ping-conexao-${Date.now()}`);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Token recusado pela Focus NFe (HTTP 401/403). Verifique a chave de API." };
    }
    const ambiente = baseUrl.includes("homologacao") ? "homologação" : "produção";
    return { ok: true, message: `Conexão com a Focus NFe (${ambiente}) autenticada com sucesso.` };
  }

  /** Consulta o status de um documento pela `ref` (providerRef). Tenta os três recursos. */
  async queryStatus(ref: string, ctx: ProviderContext): Promise<EmitResult> {
    for (const resource of ["nfe", "nfce", "nfse"] as const) {
      const res = await this.request<FocusInvoiceResponse>(ctx, "GET", `/${resource}/${encodeURIComponent(ref)}`);
      if (res.ok && res.data) {
        return this.toEmitResult(res.data, ref, ctx);
      }
    }
    return { status: "PROCESSANDO", providerRef: ref, motivo: "Documento não localizado na Focus NFe." };
  }
}
