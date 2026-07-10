/**
 * Consultas de cadastro (CEP e CNPJ) via APIs públicas gratuitas, para autopreencher
 * clientes/fornecedores/destinatários.
 *
 * Fontes:
 *  - CEP: ViaCEP (https://viacep.com.br) — retorna o código IBGE do município.
 *  - CNPJ: BrasilAPI (https://brasilapi.com.br/api/cnpj) — Receita Federal. Não traz IE
 *    nem o código IBGE; quando há CEP, enriquecemos o IBGE via ViaCEP.
 *
 * Tudo server-side (estas chamadas saem do servidor da aplicação, não do navegador).
 * IMPORTANTE: o ambiente de execução precisa permitir saída de rede para esses domínios.
 */

export type LookupEndereco = {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
  codigoMunicipioIbge: string | null;
};

export type CepLookupResult = LookupEndereco & { ddd: string | null };

export type CnpjLookupResult = {
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  inscricaoEstadual: string | null;
  email: string | null;
  telefone: string | null;
  /** Regime detectado pela opção Simples/MEI da Receita (null = a fonte não informou). */
  regimeDetectado: "MEI" | "SIMPLES_NACIONAL" | null;
  endereco: LookupEndereco;
};

import { normalizeDocumento } from "@/lib/fiscal/documento";

export class CadastroLookupError extends Error {}

const onlyDigits = (v: string) => (v ?? "").replace(/\D/g, "");

// O fetch do Node envia "User-Agent: node" por padrão, e provedores atrás de
// Cloudflare (BrasilAPI) respondem 403 a UAs não-navegador. Usamos um UA de navegador.
const LOOKUP_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; xerp/1.0)"
};

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  ddd?: string;
  erro?: boolean;
};

/** Busca um CEP no ViaCEP. Lança CadastroLookupError em entrada/serviço inválidos. */
export async function lookupCep(cep: string): Promise<CepLookupResult> {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) throw new CadastroLookupError("CEP deve ter 8 dígitos.");

  let res: Response;
  try {
    res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      headers: LOOKUP_HEADERS
    });
  } catch (err) {
    throw new CadastroLookupError(`Falha ao consultar o CEP: ${err instanceof Error ? err.message : "erro de rede"}`);
  }
  if (!res.ok) throw new CadastroLookupError(`Serviço de CEP indisponível (HTTP ${res.status}).`);

  const data = (await res.json().catch(() => ({}))) as ViaCepResponse;
  if (data.erro) throw new CadastroLookupError("CEP não encontrado.");

  return {
    logradouro: data.logradouro || null,
    numero: null,
    complemento: data.complemento || null,
    bairro: data.bairro || null,
    cep: digits,
    cidade: data.localidade || null,
    uf: data.uf || null,
    codigoMunicipioIbge: data.ibge || null,
    ddd: data.ddd || null
  };
}

type BrasilApiCnpjResponse = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  uf?: string;
  municipio?: string;
  codigo_municipio_ibge?: string;
  ddd_telefone_1?: string;
  email?: string;
  opcao_pelo_simples?: boolean | null;
  opcao_pelo_mei?: boolean | null;
  message?: string;
};

/** Formata "DDDNNNNNNNN" → "(DD) NNNNN-NNNN" quando possível. */
function formatPhone(raw: string | null | undefined): string | null {
  const d = onlyDigits(raw ?? "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw || null;
}

function mapBrasilApiShape(d: BrasilApiCnpjResponse, digits: string): CnpjLookupResult {
  const cep = d.cep ? onlyDigits(d.cep) : null;
  return {
    cnpj: digits,
    razaoSocial: d.razao_social || null,
    nomeFantasia: d.nome_fantasia || null,
    situacaoCadastral: d.descricao_situacao_cadastral || null,
    // Estas APIs públicas não retornam inscrição estadual.
    inscricaoEstadual: null,
    email: d.email || null,
    telefone: formatPhone(d.ddd_telefone_1),
    regimeDetectado: d.opcao_pelo_mei ? "MEI" : d.opcao_pelo_simples ? "SIMPLES_NACIONAL" : null,
    endereco: {
      logradouro: d.logradouro || null,
      numero: d.numero || null,
      complemento: d.complemento || null,
      bairro: d.bairro || null,
      cep,
      cidade: d.municipio || null,
      uf: d.uf || null,
      codigoMunicipioIbge: d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : null
    }
  };
}

/**
 * Busca um CNPJ na Receita. Tenta provedores públicos em cadeia (mesmo formato
 * BrasilAPI), pois têm rate limit por IP e podem responder 403/429:
 *  1) BrasilAPI  2) minhareceita.org
 * Só 404 significa "não encontrado"; demais falhas tentam o próximo provedor.
 */
export async function lookupCnpj(cnpj: string): Promise<CnpjLookupResult> {
  // Preserva letras: o CNPJ pode ser alfanumérico (novo formato). As APIs públicas podem ainda
  // não suportá-lo — nesse caso caem no fallback "preencha manualmente" mais abaixo.
  const doc = normalizeDocumento(cnpj);
  if (doc.length !== 14) throw new CadastroLookupError("CNPJ deve ter 14 caracteres.");

  const sources = [
    `https://brasilapi.com.br/api/cnpj/v1/${doc}`,
    `https://minhareceita.org/${doc}`
  ];

  let lastStatus = 0;
  for (const url of sources) {
    let res: Response;
    try {
      res = await fetch(url, { headers: LOOKUP_HEADERS });
    } catch {
      continue; // erro de rede neste provedor — tenta o próximo
    }
    if (res.status === 404) throw new CadastroLookupError("CNPJ não encontrado.");
    if (!res.ok) {
      lastStatus = res.status;
      continue; // 403/429/5xx — tenta o próximo
    }
    const d = (await res.json().catch(() => null)) as BrasilApiCnpjResponse | null;
    if (d && d.razao_social) return mapBrasilApiShape(d, doc);
    lastStatus = res.status;
  }

  throw new CadastroLookupError(
    lastStatus
      ? `Serviço de consulta de CNPJ indisponível no momento (HTTP ${lastStatus}). Tente novamente em instantes ou preencha manualmente.`
      : "Não foi possível consultar o CNPJ agora. Tente novamente em instantes ou preencha manualmente."
  );
}
