import type { AmbienteFiscal, ModeloFiscal, ProvedorFiscal, RegimeTributario, StatusNotaFiscal } from "@prisma/client";
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
import { randomBytes } from "node:crypto";
import { normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * Provedor fiscal ACBr API (https://dev.acbr.api.br) para NF-e, NFC-e e NFS-e.
 *
 * Particularidades que moldam esta implementação:
 *  - Autenticação OAuth 2.0 `client_credentials`: trocamos client_id/client_secret por um
 *    access_token (Bearer) com validade ~30 dias. O token é cacheado em memória por
 *    ambiente+client_id e renovado perto do vencimento (o endpoint de token tem limite de
 *    10 req/min, então não pedimos token a cada chamada).
 *  - Mapeamento de credenciais no nosso modelo: `token` (criptografado) = client_secret,
 *    `cscId` = client_id. A baseUrl é derivada do ambiente.
 *  - O payload é no nível do XML da SEFAZ (compatível com Nuvem Fiscal): infNFe/ide/emit/
 *    dest/det[]/total/pag para NF-e e NFC-e; infDPS/prest/toma/serv/valores para NFS-e
 *    (padrão nacional DPS — `POST /nfse/dps`, já que `POST /nfse` está descontinuado).
 *  - Dados do emitente, certificado A1 e configurações de série vêm do cadastro da empresa
 *    na ACBr (`/empresas`), não do payload de emissão.
 *  - Tratamento de cota (402) e rate limit (429 com Retry-After).
 *
 * Observação: emissão real exige empresa + certificado cadastrados na ACBr. Sem certificado,
 * a SEFAZ/prefeitura rejeita. Consulta/listagem/status funcionam apenas com o token.
 */

const ACBR_BASE_URL: Record<AmbienteFiscal, string> = {
  PRODUCAO: "https://prod.acbr.api.br",
  HOMOLOGACAO: "https://hom.acbr.api.br"
};

const ACBR_AUTH_URL = "https://auth.acbr.api.br/realms/ACBrAPI/protocol/openid-connect/token";
const ACBR_SCOPES = "empresa nfe nfce nfse conta distribuicao-nfe";

/** Recurso REST por modelo. NFS-e usa o endpoint DPS (nacional). */
const ACBR_RESOURCE = { NFE: "nfe", NFCE: "nfce", NFSE: "nfse" } as const;

/**
 * CNPJ a informar no Grupo de Autorização de download do XML (autXML) por UF que exige.
 * A Bahia rejeita a NF-e sem esse grupo; na ausência de escritório de contabilidade,
 * a própria SEFAZ orienta informar o CNPJ dela.
 */
const UF_AUTXML_CNPJ: Record<string, string> = {
  BA: "13937073000156" // SEFAZ Bahia
};

/** Código IBGE da UF (cUF) por sigla. */
const UF_TO_CUF: Record<string, number> = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23,
  RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35,
  PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53
};

type AcbrTokenResponse = { access_token?: string; expires_in?: number; token_type?: string; error?: string; error_description?: string };

/** Resposta de DF-e (NF-e/NFC-e). */
type AcbrDfeResponse = {
  id?: string;
  status?: string;
  chave?: string;
  numero?: number;
  data_emissao?: string;
  autorizacao?: { protocolo?: string; data_recebimento?: string; codigo_status?: number; motivo_status?: string };
  error?: { code?: string; message?: string; errors?: Array<{ message?: string }> };
};

/** Resposta de evento (cancelamento / carta de correção): objeto de evento, não o DF-e. */
type AcbrCancelResponse = {
  id?: string;
  status?: string;
  codigo_status?: number;
  motivo_status?: string;
  numero_protocolo?: string;
  numero_sequencial?: number;
  error?: { code?: string; message?: string; errors?: Array<{ message?: string }> };
};

/** Resposta de NFS-e. */
type AcbrNfseResponse = {
  id?: string;
  status?: string;
  numero?: string;
  codigo_verificacao?: string;
  link_url?: string;
  mensagens?: Array<{ codigo?: string; descricao?: string; correcao?: string }>;
  error?: { code?: string; message?: string; errors?: Array<{ message?: string }> };
};

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function fiscalDateTimeSaoPaulo(date = new Date()): { dhEmi: string; dCompet: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const dCompet = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { dhEmi: `${dCompet}T${hour}:${get("minute")}:${get("second")}-03:00`, dCompet };
}

function isSimplesRegime(regime: RegimeTributario): boolean {
  return regime === "SIMPLES_NACIONAL" || regime === "MEI" || regime === "SIMPLES_EXCESSO_SUBLIMITE";
}

/** CRT (Código de Regime Tributário) da NF-e: 1=Simples, 2=Simples excesso, 3=Normal/Presumido. */
function crtFocus(regime: RegimeTributario): number {
  if (regime === "SIMPLES_NACIONAL" || regime === "MEI") return 1;
  if (regime === "SIMPLES_EXCESSO_SUBLIMITE") return 2;
  return 3;
}

/** finNFe: 1=normal, 2=complementar, 3=ajuste, 4=devolução. */
function finalidade(fin: EmitInput["document"]["finalidade"]): number {
  switch (fin) {
    case "COMPLEMENTAR": return 2;
    case "AJUSTE": return 3;
    case "DEVOLUCAO": return 4;
    default: return 1;
  }
}

/** Status DF-e (NF-e/NFC-e) → StatusNotaFiscal interno. */
function mapDfeStatus(status: string | null | undefined): StatusNotaFiscal {
  switch ((status ?? "").toLowerCase()) {
    case "autorizado": return "AUTORIZADA";
    case "cancelado": return "CANCELADA";
    case "denegado": return "DENEGADA";
    case "rejeitado":
    case "erro": return "REJEITADA";
    case "pendente":
    case "processando": return "PROCESSANDO";
    default: return "PROCESSANDO";
  }
}

/** Status NFS-e → StatusNotaFiscal interno. */
function mapNfseStatus(status: string | null | undefined): StatusNotaFiscal {
  switch ((status ?? "").toLowerCase()) {
    case "autorizada": return "AUTORIZADA";
    case "cancelada":
    case "substituida": return "CANCELADA";
    case "negada": return "DENEGADA";
    case "erro": return "REJEITADA";
    case "processando": return "PROCESSANDO";
    default: return "PROCESSANDO";
  }
}

function isDfeFinal(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return ["autorizado", "cancelado", "denegado", "rejeitado", "erro", "autorizada", "cancelada", "negada", "substituida"].includes(s);
}

/** tPag (forma de pagamento SEFAZ): 01=dinheiro, 03=crédito, 04=débito, 17=pix, 90=sem pagamento... */
function mapTpPag(forma: string | null): string {
  const f = (forma ?? "").toLowerCase();
  // "Sem pagamento" (90) é obrigatório em operações sem contraprestação financeira (ex.: devolução).
  if (f.includes("sem pagamento") || f.includes("sem pgto")) return "90";
  if (f.includes("pix")) return "17";
  if (f.includes("credito") || f.includes("crédito") || f.includes("credit")) return "03";
  if (f.includes("debito") || f.includes("débito") || f.includes("debit")) return "04";
  if (f.includes("boleto") || f.includes("billet")) return "15";
  if (f.includes("dinheiro") || f.includes("cash") || f.includes("especie") || f.includes("espécie")) return "01";
  if (f.includes("transfer")) return "18";
  return "99";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Arredonda para 2 casas (valores monetários do XML da SEFAZ). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Monta o grupo PIS/COFINS do XML conforme o CST (a SEFAZ valida o par CST↔grupo):
 *  - 01, 02 → PISAliq/COFINSAliq (tributação por alíquota: vBC/pPIS/vPIS)
 *  - 04, 05, 06, 07, 08, 09 → PISNT/COFINSNT (não tributado: só CST)
 *  - demais (ex.: 49, 99) → PISOutr/COFINSOutr (outras operações: vBC/alíquota/valor)
 * Ex.: CST 49 com PISAliq é rejeitado; aqui ele cai corretamente em PISOutr.
 */
function pisCofinsGroup(
  tipo: "PIS" | "COFINS",
  cst: string,
  base: number,
  aliquota: number,
  valor: number
): Record<string, unknown> {
  const c = (cst || "").padStart(2, "0");
  const aliqKey = tipo === "PIS" ? "pPIS" : "pCOFINS";
  const valKey = tipo === "PIS" ? "vPIS" : "vCOFINS";
  if (c === "01" || c === "02") {
    return { [`${tipo}Aliq`]: { CST: c, vBC: base, [aliqKey]: aliquota, [valKey]: valor } };
  }
  if (["04", "05", "06", "07", "08", "09"].includes(c)) {
    return { [`${tipo}NT`]: { CST: c } };
  }
  return { [`${tipo}Outr`]: { CST: c, vBC: base, [aliqKey]: aliquota, [valKey]: valor } };
}

/**
 * Deriva o código de tributação nacional (cTribNac, 6 dígitos) a partir do item LC116.
 * Formato: item(2) + subitem(2) + desdobro(2). Ex.: "1.01" → "010101".
 * Best-effort — a lista nacional pode ter desdobros específicos; revisar por serviço.
 */
function cTribNacFromLc116(lc116: string | null | undefined): string {
  const parts = (lc116 ?? "").split(".");
  if (parts.length < 2) return "010101";
  const item = parts[0].replace(/\D/g, "").padStart(2, "0").slice(-2);
  const sub = parts[1].replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  return `${item}${sub}01`;
}

// Cache de token OAuth em memória, por ambiente+client_id. Sobrevive entre requisições no
// mesmo processo; é apenas otimização (o token é sempre renovável a partir das credenciais).
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export class AcbrFiscalProvider implements FiscalProvider {
  readonly id: ProvedorFiscal = "ACBR";

  // -------------------------------------------------------------------------
  // Autenticação OAuth2 + cliente HTTP.
  // -------------------------------------------------------------------------

  /** client_id = ctx.cscId, client_secret = ctx.token (descriptografado). */
  private resolveConfig(ctx: ProviderContext): { baseUrl: string; clientId: string; clientSecret: string } {
    const clientSecret = ctx.token?.trim();
    const clientId = ctx.cscId?.trim();
    if (!clientId || !clientSecret) {
      throw new Error(
        "Provedor ACBr selecionado, mas client_id/client_secret não estão configurados. Informe em Configurações › Fiscal."
      );
    }
    const baseUrl = (ctx.baseUrl?.trim() || ACBR_BASE_URL[ctx.ambiente]).replace(/\/$/, "");
    return { baseUrl, clientId, clientSecret };
  }

  /** Obtém um access_token válido (cacheado), renovando perto do vencimento. */
  private async getAccessToken(ctx: ProviderContext): Promise<string> {
    const { clientId, clientSecret } = this.resolveConfig(ctx);
    const cacheKey = `${ctx.ambiente}:${clientId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt - 60_000 > Date.now()) {
      return cached.token;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: ACBR_SCOPES
    });

    let response: Response;
    try {
      response = await fetch(ACBR_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: body.toString()
      });
    } catch (err) {
      throw new Error(`Falha ao autenticar na ACBr: ${err instanceof Error ? err.message : "erro de rede"}`);
    }

    const data = (await response.json().catch(() => ({}))) as AcbrTokenResponse;
    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || `Falha ao obter token da ACBr (HTTP ${response.status}).`);
    }
    const expiresAt = Date.now() + (data.expires_in ?? 300) * 1000;
    tokenCache.set(cacheKey, { token: data.access_token, expiresAt });
    return data.access_token;
  }

  /** Chamada autenticada à API. Trata 402 (cota), 429 (rate limit) e JSON malformado. */
  private async request<T>(
    ctx: ProviderContext,
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<{ ok: boolean; status: number; data: T | undefined; errorMessage: string | null }> {
    const { baseUrl } = this.resolveConfig(ctx);
    const token = await this.getAccessToken(ctx);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (err) {
      throw new Error(`Falha de comunicação com a ACBr: ${err instanceof Error ? err.message : "erro desconhecido"}`);
    }

    const raw = await response.text().catch(() => "");
    let data: unknown = undefined;
    if (raw) {
      try { data = JSON.parse(raw); } catch { data = undefined; }
    }

    let errorMessage: string | null = null;
    if (!response.ok) {
      if (response.status === 429) {
        const retry = response.headers.get("Retry-After") || "alguns";
        errorMessage = `Limite de requisições da ACBr excedido (HTTP 429). Tente novamente em ${retry} segundos.`;
      } else if (response.status === 402) {
        errorMessage = "Créditos insuficientes ou cota excedida na ACBr (HTTP 402). Adquira nova franquia no console da ACBr.";
      } else {
        const err = (data as { error?: { message?: string; errors?: Array<{ message?: string; field?: string }> } } | undefined)?.error;
        const detalhe = err?.errors?.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).filter(Boolean).join("; ");
        errorMessage = detalhe
          ? `${err?.message ?? "Falha de validação"}: ${detalhe}`
          : err?.message ?? `ACBr retornou HTTP ${response.status}.`;
      }
    }
    return { ok: response.ok, status: response.status, data: data as T | undefined, errorMessage };
  }

  private ambienteStr(ctx: ProviderContext): "producao" | "homologacao" {
    return ctx.ambiente === "PRODUCAO" ? "producao" : "homologacao";
  }

  // -------------------------------------------------------------------------
  // Emissão.
  // -------------------------------------------------------------------------

  async emit(input: EmitInput, ctx: ProviderContext): Promise<EmitResult> {
    const modelo = input.document.modelo;
    if (modelo === "NFSE") return this.emitNfse(input, ctx);
    return this.emitDfe(input, ctx, modelo);
  }

  /** NF-e (mod 55) e NFC-e (mod 65). */
  private async emitDfe(input: EmitInput, ctx: ProviderContext, modelo: "NFE" | "NFCE"): Promise<EmitResult> {
    const resource = ACBR_RESOURCE[modelo];
    const body = this.buildDfeBody(input, modelo);
    const posted = await this.request<AcbrDfeResponse>(ctx, "POST", `/${resource}`, body);

    // Sem id no retorno = erro de validação/envelope (não há documento criado na ACBr).
    if (!posted.ok && !posted.data?.id) {
      return { status: "ERRO", motivo: posted.errorMessage ?? "Falha ao emitir na ACBr." };
    }
    let result = this.toDfeResult(posted.data, ctx, resource);
    // Acompanhamento por status quando ainda pendente/processando.
    if (result.status === "PROCESSANDO" && result.providerRef) {
      result = await this.pollDfe(ctx, resource, result.providerRef);
    }
    return result;
  }

  private async pollDfe(ctx: ProviderContext, resource: string, id: string): Promise<EmitResult> {
    let last: EmitResult = { status: "PROCESSANDO", providerRef: id };
    for (let i = 0; i < 5; i++) {
      await delay(3000);
      const res = await this.request<AcbrDfeResponse>(ctx, "GET", `/${resource}/${encodeURIComponent(id)}`);
      if (!res.ok || !res.data) continue;
      last = this.toDfeResult(res.data, ctx, resource);
      if (isDfeFinal(res.data.status)) break;
    }
    return last;
  }

  private toDfeResult(data: AcbrDfeResponse | undefined, ctx: ProviderContext, resource: string): EmitResult {
    const { baseUrl } = this.resolveConfig(ctx);
    const id = data?.id;
    // Prefere os erros detalhados (error.errors[]) ao genérico "Validation failed".
    const detalhe = data?.error?.errors?.map((e) => e.message).filter(Boolean).join("; ");
    const motivo =
      data?.autorizacao?.motivo_status ??
      (detalhe ? `${data?.error?.message ?? "Falha de validação"}: ${detalhe}` : data?.error?.message) ??
      undefined;
    return {
      status: mapDfeStatus(data?.status),
      providerRef: id,
      chaveAcesso: data?.chave || undefined,
      protocolo: data?.autorizacao?.protocolo || undefined,
      // Endpoints de download exigem Bearer; guardamos a URL da API para download server-side.
      xmlUrl: id ? `${baseUrl}/${resource}/${id}/xml` : undefined,
      danfeUrl: id ? `${baseUrl}/${resource}/${id}/pdf` : undefined,
      motivo: motivo || undefined
    };
  }

  /** NFS-e via DPS (padrão nacional). */
  private async emitNfse(input: EmitInput, ctx: ProviderContext): Promise<EmitResult> {
    const body = await this.buildNfseBody(input, ctx);
    const posted = await this.request<AcbrNfseResponse>(ctx, "POST", "/nfse/dps", body);
    if (!posted.ok && posted.status !== 422) {
      return { status: "ERRO", motivo: posted.errorMessage ?? "Falha ao emitir NFS-e na ACBr." };
    }
    let result = this.toNfseResult(posted.data, ctx);
    const nfseId = result.providerRef;
    if (result.status === "PROCESSANDO" && nfseId) {
      for (let i = 0; i < 5; i++) {
        await delay(3000);
        const res = await this.request<AcbrNfseResponse>(ctx, "GET", `/nfse/${encodeURIComponent(nfseId)}`);
        if (!res.ok || !res.data) continue;
        result = this.toNfseResult(res.data, ctx);
        if (isDfeFinal(res.data.status)) break;
      }
    }
    return result;
  }

  private toNfseResult(data: AcbrNfseResponse | undefined, ctx: ProviderContext): EmitResult {
    const { baseUrl } = this.resolveConfig(ctx);
    const id = data?.id;
    const motivo = data?.mensagens?.map((m) => m.descricao).filter(Boolean).join("; ") || data?.error?.message || undefined;
    return {
      status: mapNfseStatus(data?.status),
      numero: data?.numero || undefined,
      providerRef: id,
      protocolo: data?.codigo_verificacao || undefined,
      xmlUrl: id ? `${baseUrl}/nfse/${id}/xml` : undefined,
      danfeUrl: data?.link_url || (id ? `${baseUrl}/nfse/${id}/pdf` : undefined),
      motivo: motivo || undefined
    };
  }

  // -------------------------------------------------------------------------
  // Construção dos corpos.
  // -------------------------------------------------------------------------

  private buildDfeBody(input: EmitInput, modelo: "NFE" | "NFCE"): Record<string, unknown> {
    const simples = isSimplesRegime(input.emitter.regime);
    const ufEmit = input.emitter.uf?.toUpperCase() ?? "";
    const ufDest = (input.document.destinatario.endereco?.uf ?? input.document.destinatario.uf ?? ufEmit).toUpperCase();
    const cUF = UF_TO_CUF[ufEmit] ?? 35;
    const cMunFG = input.emitter.codigoMunicipioIbge ?? "";
    const isNfce = modelo === "NFCE";
    const idDest = isNfce ? 1 : ufEmit && ufDest && ufEmit !== ufDest ? 2 : 1;
    const refChave = onlyDigits(input.document.chaveReferenciada);
    // Devolução é operação sem pagamento (tPag=90), independente da forma informada.
    const tpPag = input.document.finalidade === "DEVOLUCAO" ? "90" : mapTpPag(input.document.formaPagamento);
    // Consumidor final: NFC-e sempre; NF-e quando o destinatário é não-contribuinte (sem IE),
    // pois a SEFAZ exige indFinal=1 nesse caso ("operação com não contribuinte").
    const indFinal = isNfce || !input.document.destinatario.inscricaoEstadual ? 1 : 0;

    // Acumula os totais a partir dos MESMOS valores por item que serão emitidos —
    // a SEFAZ rejeita se total.ICMSTot.* divergir da soma dos itens (ex.: vFCP).
    const sum = { vBC: 0, vICMS: 0, vFCP: 0, vProd: 0, vPIS: 0, vCOFINS: 0 };

    const det = input.document.itens.map((item, index) => {
      const numeroItem = index + 1;
      const taxes = input.computed.find((c) => c.numeroItem === numeroItem)?.taxes;
      const orig = Number(taxes?.origem ?? item.origem ?? "0") || 0;
      const base = item.valorTotal - item.desconto;

      // ICMS: Simples usa CSOSN (ICMSSN102); Normal usa CST com base/alíquota/valor (ICMS00).
      const icms = simples
        ? { ICMSSN102: { orig, CSOSN: taxes?.csosn ?? "102" } }
        : {
            ICMS00: {
              orig, CST: taxes?.cstIcms ?? "00", modBC: 3,
              vBC: taxes?.baseIcms ?? base, pICMS: taxes?.aliquotaIcms ?? 0, vICMS: taxes?.valorIcms ?? 0,
              // FCP por item para reconciliar com total.ICMSTot.vFCP (a SEFAZ valida a soma).
              pFCP: taxes?.percentualFcp ?? 0, vFCP: taxes?.valorFcp ?? 0
            }
          };
      // PIS/COFINS: o grupo do XML depende do CST, não do regime. Simples normalmente
      // não tributa (CST 49 → grupo "Outras Operações"); CST 01/02 → alíquota; 04-09 → NT.
      const pis = pisCofinsGroup("PIS", simples ? taxes?.cstPis ?? "49" : taxes?.cstPis ?? "01", base, taxes?.aliquotaPis ?? 0, taxes?.valorPis ?? 0);
      const cofins = pisCofinsGroup("COFINS", simples ? taxes?.cstCofins ?? "49" : taxes?.cstCofins ?? "01", base, taxes?.aliquotaCofins ?? 0, taxes?.valorCofins ?? 0);

      // Acumula exatamente o que foi colocado no item.
      sum.vProd += item.valorTotal;
      if (!simples) {
        sum.vBC += taxes?.baseIcms ?? base;
        sum.vICMS += taxes?.valorIcms ?? 0;
        sum.vFCP += taxes?.valorFcp ?? 0;
      }
      // PIS/COFINS NT não destacam valor; só Aliq/Outr entram no total.
      if (pis.PISNT === undefined) sum.vPIS += taxes?.valorPis ?? 0;
      if (cofins.COFINSNT === undefined) sum.vCOFINS += taxes?.valorCofins ?? 0;

      return {
        nItem: numeroItem,
        prod: {
          // cProd é obrigatório na SEFAZ; itens avulsos podem vir sem código — usa o nº do item.
          cProd: item.codigo?.trim() || String(numeroItem), cEAN: "SEM GTIN", xProd: item.descricao,
          NCM: item.ncm ?? "00000000", CFOP: item.cfop ?? (isNfce ? "5102" : "5102"),
          uCom: item.unidade, qCom: item.quantidade, vUnCom: item.valorUnitario, vProd: item.valorTotal,
          cEANTrib: "SEM GTIN", uTrib: item.unidade, qTrib: item.quantidade, vUnTrib: item.valorUnitario,
          vDesc: item.desconto || undefined, indTot: 1
        },
        imposto: { ICMS: icms, PIS: pis, COFINS: cofins }
      };
    });

    const t = input.totals;
    return {
      ambiente: this.ambienteStr({ ambiente: input.document.ambiente } as ProviderContext),
      referencia: input.integrationId,
      infNFe: {
        versao: "4.00",
        ide: {
          cUF, natOp: input.document.naturezaOperacao, mod: isNfce ? 65 : 55,
          serie: Number(input.document.serie) || 1, nNF: input.numero,
          // Devolução é emitida como entrada (tpNF=0); demais finalidades, saída (tpNF=1).
          dhEmi: new Date().toISOString(), tpNF: input.document.finalidade === "DEVOLUCAO" ? 0 : 1, idDest, cMunFG,
          tpImp: isNfce ? 4 : 1, tpEmis: 1, finNFe: finalidade(input.document.finalidade),
          indFinal, indPres: 1, procEmi: 0, verProc: "JR-Brasil-Integrado",
          // Referência à NF-e original (obrigatória na devolução): grupo NFref/refNFe.
          ...(refChave.length === 44 ? { NFref: [{ refNFe: refChave }] } : {})
        },
        emit: { CNPJ: normalizeDocumento(input.emitter.cnpj), CRT: crtFocus(input.emitter.regime) },
        dest: this.buildDest(input, isNfce),
        // Grupo de Autorização de download do XML, exigido por algumas UFs (ex.: BA).
        ...(UF_AUTXML_CNPJ[ufEmit] ? { autXML: [{ CNPJ: UF_AUTXML_CNPJ[ufEmit] }] } : {}),
        det,
        total: {
          ICMSTot: {
            // Somados a partir dos itens emitidos (não de t.*), para bater na validação da SEFAZ.
            vBC: round2(sum.vBC), vICMS: round2(sum.vICMS), vICMSDeson: 0,
            vFCP: round2(sum.vFCP), vBCST: 0, vST: t.valorIcmsSt, vFCPST: 0, vFCPSTRet: 0,
            vProd: round2(sum.vProd), vFrete: input.document.valorFrete, vSeg: input.document.valorSeguro,
            vDesc: input.document.valorDesconto, vII: 0, vIPI: t.valorIpi, vIPIDevol: 0,
            vPIS: round2(sum.vPIS), vCOFINS: round2(sum.vCOFINS), vOutro: input.document.outrasDespesas, vNF: input.total
          }
        },
        // modFrete: usa a modalidade informada; senão deriva (9=sem transporte se frete=0, senão 0=CIF).
        transp: { modFrete: input.document.modalidadeFrete ?? (input.document.valorFrete > 0 ? 0 : 9) },
        // Devolução não tem contraprestação financeira → tPag=90 (Sem Pagamento), vPag=0.
        pag: { detPag: [tpPag === "90" ? { tPag: "90", vPag: 0 } : { tPag: tpPag, vPag: input.total }] }
      }
    };
  }

  private buildDest(input: EmitInput, isNfce: boolean): Record<string, unknown> | undefined {
    const dest = input.document.destinatario;
    const doc = normalizeDocumento(dest.documento);
    // NFC-e: destinatário é opcional; só envia se houver CPF/CNPJ informado.
    if (isNfce && !doc) return undefined;

    const end = dest.endereco;
    const cep = onlyDigits(end?.cep);
    const enderDest =
      end && (end.logradouro ?? "").trim() && cep.length === 8
        ? {
            xLgr: end.logradouro, nro: end.numero ?? "S/N", xBairro: end.bairro ?? "",
            cMun: end.codigoMunicipioIbge ?? "", xMun: end.cidade ?? "",
            UF: end.uf ?? dest.uf ?? "", CEP: cep, cPais: "1058", xPais: "BRASIL"
          }
        : undefined;
    return {
      ...(doc.length === 14 ? { CNPJ: doc } : doc.length === 11 ? { CPF: doc } : {}),
      xNome: dest.nome,
      ...(enderDest ? { enderDest } : {}),
      indIEDest: dest.inscricaoEstadual ? 1 : 9,
      ...(dest.inscricaoEstadual ? { IE: dest.inscricaoEstadual } : {}),
      ...(dest.email ? { email: dest.email } : {})
    };
  }

  private async buildNfseBody(input: EmitInput, ctx: ProviderContext): Promise<Record<string, unknown>> {
    const dest = input.document.destinatario;
    const doc = normalizeDocumento(dest.documento);
    const end = dest.endereco;
    const servicoTax = input.computed.find((c) => c.taxes.aliquotaIss > 0 || c.taxes.itemListaServico != null)?.taxes;
    const aliquotaIss = servicoTax?.aliquotaIss ?? 0;
    const itemLc116 = servicoTax?.itemListaServico ?? "";
    // cNBS (Nomenclatura Brasileira de Serviços): exigido no cServ pela DPS nacional.
    const cNbs = onlyDigits(input.document.itens.find((i) => i.servico && i.codigoNbs)?.codigoNbs);
    const ret = input.document.retencoes ?? null;
    const descricao =
      input.document.itens.map((i) => i.descricao).join("; ") ||
      input.document.informacoesComplementares?.trim() ||
      input.document.naturezaOperacao;

    // Determina provedor (nacional para municípios PadraoNacional). Best-effort, cai para "padrao".
    const provedor = await this.resolveNfseProvider(ctx, input.emitter.codigoMunicipioIbge);

    // Quando o município de incidência está ATIVO no Sistema Nacional NFS-e (provedor "nacional"),
    // a alíquota do ISSQN é parametrizada pelo próprio sistema e NÃO pode ser informada na DPS —
    // isso vale para qualquer regime (Simples ou não). Informar pAliq nesse caso é denegado.
    const informarAliquota = provedor !== "nacional";

    const toma: Record<string, unknown> = { xNome: dest.nome };
    if (doc.length === 14) toma.CNPJ = doc;
    else if (doc.length === 11) toma.CPF = doc;
    if (dest.email) toma.email = dest.email;
    if (end) {
      const cep = onlyDigits(end.cep);
      toma.end = {
        endNac: { cMun: end.codigoMunicipioIbge ?? "", CEP: cep.length === 8 ? cep : undefined },
        xLgr: end.logradouro ?? undefined, nro: end.numero ?? undefined, xBairro: end.bairro ?? undefined
      };
    }

    const tribFed =
      ret && (ret.ir || ret.pis || ret.cofins || ret.csll)
        ? {
            ...(ret.pis || ret.cofins
              ? { piscofins: { vPis: ret.pis?.valor ?? 0, vCofins: ret.cofins?.valor ?? 0 } }
              : {}),
            ...(ret.ir ? { vRetIRRF: ret.ir.valor } : {}),
            ...(ret.csll ? { vRetCSLL: ret.csll.valor } : {})
          }
        : undefined;
    const dataFiscal = fiscalDateTimeSaoPaulo();

    return {
      provedor,
      ambiente: this.ambienteStr(ctx),
      referencia: input.integrationId,
      infDPS: {
        tpAmb: ctx.ambiente === "PRODUCAO" ? 1 : 2,
        dhEmi: dataFiscal.dhEmi,
        dCompet: dataFiscal.dCompet,
        prest: { CNPJ: normalizeDocumento(input.emitter.cnpj) },
        toma,
        serv: {
          locPrest: { cLocPrestacao: input.emitter.codigoMunicipioIbge ?? undefined },
          // cTribNac (código nacional) derivado do item LC116; cNBS (9 dígitos) exigido pela DPS.
          // OBS: o leiaute atual da ACBr (TCServ) NÃO aceita cClassTrib em cServ — o grupo
          // IBS/CBS da Reforma Tributária ainda não é exigido (validação suspensa em 2026).
          // Guardamos o cClassTrib no nosso banco e o enviaremos quando o grupo for liberado.
          cServ: {
            cTribNac: cTribNacFromLc116(itemLc116),
            ...(cNbs.length === 9 ? { cNBS: cNbs } : {}),
            xDescServ: descricao
          }
        },
        valores: {
          vServPrest: { vServ: input.totals.valorServicos || input.total },
          trib: {
            tribMun: {
              tribISSQN: 1, // 1 = operação tributável
              ...(informarAliquota
                ? { pAliq: aliquotaIss, vISSQN: input.totals.valorIss || undefined }
                : {}),
              tpRetISSQN: ret?.issRetido ? 2 : 1
            },
            ...(tribFed ? { tribFed } : {}),
            // Total de tributos (obrigatório no DPS): federal/estadual/municipal.
            totTrib: {
              vTotTrib: {
                vTotTribFed: (ret?.pis?.valor ?? 0) + (ret?.cofins?.valor ?? 0) + (ret?.ir?.valor ?? 0) + (ret?.csll?.valor ?? 0),
                vTotTribEst: 0,
                vTotTribMun: input.totals.valorIss || 0
              }
            }
          }
        }
      }
    };
  }

  /** Consulta os metadados da cidade para decidir provedor NFS-e (nacional vs padrão). */
  private async resolveNfseProvider(ctx: ProviderContext, codigoIbge: string | null): Promise<"nacional" | "padrao"> {
    // Override explícito da configuração tem prioridade sobre a auto-detecção.
    if (ctx.nfseAmbienteNacional === true) return "nacional";
    if (ctx.nfseAmbienteNacional === false) return "padrao";
    if (!codigoIbge) return "padrao";
    try {
      const res = await this.request<{ provedor?: string }>(ctx, "GET", `/nfse/cidades/${encodeURIComponent(codigoIbge)}`);
      if (res.ok && (res.data?.provedor ?? "").toLowerCase() === "padraonacional") return "nacional";
    } catch {
      // Falha de metadados não impede a emissão; usa o padrão da prefeitura.
    }
    return "padrao";
  }

  // -------------------------------------------------------------------------
  // Cancelamento, carta de correção, consulta e teste de conexão.
  // -------------------------------------------------------------------------

  async cancel(input: CancelInput, ctx: ProviderContext): Promise<CancelResult> {
    if (!input.providerRef) return { status: "ERRO", motivo: "Identificador do documento na ACBr ausente." };
    const ref = encodeURIComponent(input.providerRef);

    // NFS-e (padrão nacional): o cancelamento é um evento da própria NFS-e e a resposta é um
    // documento NFS-e com situação atualizada (não um evento DF-e com código 135/155). Algumas
    // prefeituras processam de forma assíncrona, então confirmamos consultando a situação.
    if (input.modelo === "NFSE") {
      const res = await this.request<AcbrNfseResponse>(ctx, "POST", `/nfse/${ref}/cancelamento`, {
        codigo: "1",
        motivo: input.justificativa
      });
      if (!res.ok) return { status: "ERRO", motivo: res.errorMessage ?? "Falha ao cancelar a NFS-e na ACBr." };
      if (mapNfseStatus(res.data?.status) === "CANCELADA") {
        return { status: "AUTORIZADO", protocolo: res.data?.codigo_verificacao || undefined };
      }
      const id = res.data?.id || input.providerRef;
      const check = await this.request<AcbrNfseResponse>(ctx, "GET", `/nfse/${encodeURIComponent(id)}`);
      if (check.ok && mapNfseStatus(check.data?.status) === "CANCELADA") {
        return { status: "AUTORIZADO", protocolo: check.data?.codigo_verificacao || undefined };
      }
      const mensagem = (res.data?.mensagens ?? [])
        .map((m) => m.descricao)
        .filter(Boolean)
        .join("; ");
      const situacao = check.data?.status ?? res.data?.status ?? "?";
      return { status: "REJEITADO", motivo: mensagem || `Cancelamento da NFS-e não confirmado (situação ${situacao}).` };
    }

    // NF-e/NFC-e: o cancelamento é um EVENTO processado de forma ASSÍNCRONA pela SEFAZ.
    // O POST pode voltar "pendente/processando" sem código final — então confirmamos
    // consultando o evento (GET .../cancelamento) e o próprio DF-e até ter resposta da SEFAZ.
    // Só marcamos AUTORIZADO com 135 (evento registrado/vinculado) ou 155 (registrado fora do prazo).
    const resource = ACBR_RESOURCE[input.modelo];
    const post = await this.request<AcbrCancelResponse>(ctx, "POST", `/${resource}/${ref}/cancelamento`, {
      justificativa: input.justificativa
    });
    if (!post.ok) return { status: "ERRO", motivo: post.errorMessage ?? "Falha ao cancelar na ACBr." };

    const homologado = (codigo: number | undefined) => codigo === 135 || codigo === 155;
    const finalDoEvento = (s: string | undefined) =>
      ["registrado", "rejeitado", "erro"].includes((s ?? "").toLowerCase());

    let evento = post.data;
    // Enquanto o evento não tiver desfecho final, consulta o status do cancelamento.
    for (let i = 0; i < 5 && !homologado(evento?.codigo_status) && !finalDoEvento(evento?.status); i++) {
      await delay(1500);
      const check = await this.request<AcbrCancelResponse>(ctx, "GET", `/${resource}/${ref}/cancelamento`);
      if (check.ok && check.data) evento = check.data;
    }

    const protocolo = evento?.numero_protocolo || undefined;
    if (homologado(evento?.codigo_status)) {
      return { status: "AUTORIZADO", protocolo };
    }

    // Fallback: confirma pelo próprio documento (status do DF-e vira "cancelado" quando homologa).
    const dfe = await this.request<AcbrDfeResponse>(ctx, "GET", `/${resource}/${ref}`);
    if (dfe.ok && mapDfeStatus(dfe.data?.status) === "CANCELADA") {
      return { status: "AUTORIZADO", protocolo };
    }

    // Sem confirmação da SEFAZ: NÃO marca como cancelada (evita divergência com o portal).
    const motivo = evento?.motivo_status
      ? `Cancelamento não confirmado pela SEFAZ (código ${evento?.codigo_status ?? "?"}): ${evento.motivo_status}`
      : `Cancelamento ainda não homologado pela SEFAZ (situação "${evento?.status ?? "pendente"}"). Tente "Atualizar status" em instantes.`;
    return { status: "REJEITADO", motivo };
  }

  async correct(input: CorrectionInput, ctx: ProviderContext): Promise<CorrectionResult> {
    if (!input.providerRef) return { status: "ERRO", motivo: "Identificador do documento na ACBr ausente." };
    // Carta de correção é exclusiva de NF-e.
    const res = await this.request<AcbrDfeResponse>(ctx, "POST", `/nfe/${encodeURIComponent(input.providerRef)}/carta-correcao`, {
      correcao: input.correcao
    });
    if (!res.ok) return { status: "ERRO", motivo: res.errorMessage ?? "Falha ao registrar carta de correção na ACBr." };
    return { status: "AUTORIZADO", protocolo: res.data?.autorizacao?.protocolo || undefined };
  }

  /** Consulta status por id (providerRef). Tenta NF-e, NFC-e e NFS-e. */
  async queryStatus(id: string, ctx: ProviderContext): Promise<EmitResult> {
    for (const resource of ["nfe", "nfce"] as const) {
      const res = await this.request<AcbrDfeResponse>(ctx, "GET", `/${resource}/${encodeURIComponent(id)}`);
      if (res.ok && res.data?.id) return this.toDfeResult(res.data, ctx, resource);
    }
    const nfse = await this.request<AcbrNfseResponse>(ctx, "GET", `/nfse/${encodeURIComponent(id)}`);
    if (nfse.ok && nfse.data?.id) return this.toNfseResult(nfse.data, ctx);
    return { status: "PROCESSANDO", providerRef: id, motivo: "Documento não localizado na ACBr." };
  }

  /**
   * Baixa o PDF (DANFE/DANFSE) ou o XML autorizado da ACBr. Os endpoints exigem Bearer,
   * por isso o download é server-side (não dá para abrir a URL direto no navegador).
   * Retorna os bytes e o content-type para a rota repassar ao cliente.
   */
  async downloadDocument(
    kind: "pdf" | "xml",
    ref: { providerRef: string; modelo: ModeloFiscal },
    ctx: ProviderContext
  ): Promise<{ ok: boolean; contentType: string; body: Buffer; filename: string; error?: string }> {
    const { baseUrl } = this.resolveConfig(ctx);
    const token = await this.getAccessToken(ctx);
    const resource = ACBR_RESOURCE[ref.modelo];
    const url = `${baseUrl}/${resource}/${encodeURIComponent(ref.providerRef)}/${kind}`;
    const contentType = kind === "pdf" ? "application/pdf" : "application/xml";

    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: contentType } });
    } catch (err) {
      return { ok: false, contentType, body: Buffer.alloc(0), filename: "", error: `Falha ao baixar da ACBr: ${err instanceof Error ? err.message : "erro de rede"}` };
    }
    if (!response.ok) {
      return { ok: false, contentType, body: Buffer.alloc(0), filename: "", error: `ACBr retornou HTTP ${response.status} ao baixar o ${kind.toUpperCase()}.` };
    }
    const body = Buffer.from(await response.arrayBuffer());
    return { ok: true, contentType, body, filename: `${resource}-${ref.providerRef}.${kind}` };
  }

  /** Ping autenticado: lista empresas. Valida OAuth + acesso à API. */
  async testConnection(ctx: ProviderContext): Promise<TestConnectionResult> {
    const res = await this.request<{ data?: unknown[] }>(ctx, "GET", "/empresas");
    if (res.ok) {
      const n = Array.isArray(res.data?.data) ? res.data!.data!.length : 0;
      return { ok: true, message: `Conexão com a ACBr (${this.ambienteStr(ctx)}) autenticada. ${n} empresa(s) cadastrada(s).` };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Credenciais recusadas pela ACBr (HTTP 401/403). Verifique client_id/client_secret e o ambiente." };
    }
    return { ok: false, message: res.errorMessage ?? `Falha ao testar conexão com a ACBr (HTTP ${res.status}).` };
  }
}

/**
 * Configura o CSC da NFC-e no cadastro da empresa na ACBr
 * (`PUT /empresas/{cpf_cnpj}`, grupo `config_nfce: { id_csc, csc }` — compatível Nuvem Fiscal).
 * O CSC é um segredo da SEFAZ: nunca logar/persistir fora do nosso banco (criptografado).
 */
export async function updateAcbrNfceCsc(
  ctx: ProviderContext,
  cnpj: string,
  idCsc: string,
  csc: string
): Promise<{ ok: boolean; message: string }> {
  const provider = new AcbrFiscalProvider();
  const documento = normalizeDocumento(cnpj);
  const res = await (provider as unknown as {
    request: <T>(c: ProviderContext, m: string, p: string, b?: unknown) => Promise<{ ok: boolean; status: number; data: T | undefined; errorMessage: string | null }>;
  }).request(ctx, "PUT", `/empresas/${documento}`, {
    config_nfce: { id_csc: String(idCsc), csc }
  });
  if (!res.ok) {
    return { ok: false, message: res.errorMessage ?? `Falha ao configurar o CSC da NFC-e na ACBr (HTTP ${res.status}).` };
  }
  return { ok: true, message: "CSC da NFC-e configurado na ACBr." };
}

/**
 * Envia a logo (logotipo) da empresa ao cadastro na ACBr
 * (`PUT /empresas/{cpf_cnpj}/logotipo`, multipart/form-data, campo `file`).
 * A logo aparece no DANFE/DANFCE/DANFSE gerado pela ACBr. PNG/JPEG até 200 KB.
 */
export async function uploadAcbrLogotipo(
  ctx: ProviderContext,
  cnpj: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ ok: boolean; message: string }> {
  const provider = new AcbrFiscalProvider();
  const documento = normalizeDocumento(cnpj);
  const access = provider as unknown as {
    resolveConfig: (c: ProviderContext) => { baseUrl: string };
    getAccessToken: (c: ProviderContext) => Promise<string>;
  };
  const { baseUrl } = access.resolveConfig(ctx);
  const token = await access.getAccessToken(ctx);

  // Monta o multipart manualmente com Content-Length explícito. O fetch/FormData nativos enviam
  // o corpo em "chunked transfer-encoding", que o servidor .NET do ACBr rejeita (HTTP 400
  // "EndOfInputReached" / "End of byte stream reader reached.").
  const boundary = `----ERPLogo${randomBytes(12).toString("hex")}`;
  const nomeArquivo = (filename || "logo").replace(/["\r\n]/g, "");
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${nomeArquivo}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    "utf8"
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, buffer, tail]);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/empresas/${documento}/logotipo`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length)
      },
      body: new Uint8Array(body)
    });
  } catch (err) {
    return { ok: false, message: `Falha ao enviar a logo à ACBr: ${err instanceof Error ? err.message : "erro de rede"}` };
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    return { ok: false, message: `ACBr retornou HTTP ${res.status} ao enviar a logo.${raw ? ` ${raw.slice(0, 200)}` : ""}` };
  }
  return { ok: true, message: "Logo enviada à ACBr com sucesso. Ela aparecerá no DANFE/cupom." };
}

/**
 * Remove a logo da empresa no cadastro da ACBr (`DELETE /empresas/{cpf_cnpj}/logotipo`).
 */
export async function deleteAcbrLogotipo(
  ctx: ProviderContext,
  cnpj: string
): Promise<{ ok: boolean; message: string }> {
  const provider = new AcbrFiscalProvider();
  const documento = normalizeDocumento(cnpj);
  const res = await (provider as unknown as {
    request: <T>(c: ProviderContext, m: string, p: string, b?: unknown) => Promise<{ ok: boolean; status: number; data: T | undefined; errorMessage: string | null }>;
  }).request(ctx, "DELETE", `/empresas/${documento}/logotipo`);
  // 404 = não havia logo: tratamos como remoção bem-sucedida (idempotente).
  if (!res.ok && res.status !== 404) {
    return { ok: false, message: res.errorMessage ?? `Falha ao remover a logo na ACBr (HTTP ${res.status}).` };
  }
  return { ok: true, message: "Logo removida da ACBr." };
}

/**
 * Envia o certificado A1 (.pfx) ao cadastro da empresa na ACBr
 * (`PUT /empresas/{cpf_cnpj}/certificado`, corpo JSON com base64 + senha).
 * Reutiliza o cliente OAuth do provider. Retorna se a operação teve sucesso.
 */
export async function uploadAcbrCertificate(
  ctx: ProviderContext,
  cnpj: string,
  buffer: Buffer,
  password: string
): Promise<{ ok: boolean; message: string }> {
  const provider = new AcbrFiscalProvider();
  const documento = normalizeDocumento(cnpj);
  // Acesso ao request privado de forma controlada (mesmo módulo do provider).
  const res = await (provider as unknown as {
    request: <T>(c: ProviderContext, m: string, p: string, b?: unknown) => Promise<{ ok: boolean; status: number; data: T | undefined; errorMessage: string | null }>;
  }).request(ctx, "PUT", `/empresas/${documento}/certificado`, {
    certificado: buffer.toString("base64"),
    password
  });
  if (!res.ok) {
    return { ok: false, message: res.errorMessage ?? `Falha ao enviar certificado à ACBr (HTTP ${res.status}).` };
  }
  return { ok: true, message: "Certificado enviado à ACBr com sucesso." };
}
