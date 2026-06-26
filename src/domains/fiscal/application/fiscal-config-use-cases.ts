import type { AmbienteFiscal, ProvedorFiscal, RegimeTributario } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { decryptSecret, encryptSecret, secretLastChars } from "@/lib/security/secret-crypto";
import { resolveFiscalProvider } from "@/domains/fiscal/providers";
import { updateAcbrNfceCsc, registrarEmpresaAcbr } from "@/domains/fiscal/providers/acbr-provider";
import { getCredenciaisProvedorPlataforma, getProvedorFiscalAtivo, provedorCred } from "@/domains/fiscal/application/plataforma-provedor-use-cases";
import { carregarCertificado } from "@/domains/fiscal/application/certificado-use-cases";

export type FiscalConfigSummary = {
  configured: boolean;
  provider: ProvedorFiscal;
  /** Provedor da NFS-e (serviços). null = usar o mesmo dos produtos. NACIONAL = direto na SEFIN. */
  provedorServicos: ProvedorFiscal | null;
  environment: AmbienteFiscal;
  regime: RegimeTributario;
  baseUrl: string;
  tokenLast4: string | null;
  hasToken: boolean;
  cscId: string;
  hasCscToken: boolean;
  /** CSC da NFC-e (ACBr): idCSC (curto) + indicador de que o código já foi salvo. */
  nfceIdCsc: string;
  hasNfceCsc: boolean;
  serieNfe: string;
  serieNfce: string;
  serieNfse: string;
  emitNfe: boolean;
  emitNfce: boolean;
  emitNfse: boolean;
  codigoMunicipioIbge: string;
  codigoServicoLc116Padrao: string;
  codigoNbsPadrao: string;
  spedyModoEmissao: string;
  certificadoInfo: string;
  logotipoInfo: string;
  nfseAmbienteNacional: boolean | null;
  active: boolean;
  testedAt: string | null;
  lastError: string | null;
  notes: string;
};

export type SaveFiscalConfigInput = {
  /** Opcional: quando omitido, herda o provedor ATIVO da plataforma (escolha de provedor é só global). */
  provider?: ProvedorFiscal;
  /** Provedor da NFS-e (serviços): null/ausente = mesmo dos produtos; "NACIONAL" = direto na SEFIN. */
  provedorServicos?: ProvedorFiscal | null;
  environment: AmbienteFiscal;
  regime: RegimeTributario;
  baseUrl?: string;
  token?: string;
  cscId?: string;
  cscToken?: string;
  nfceIdCsc?: string;
  nfceCsc?: string;
  serieNfe?: string;
  serieNfce?: string;
  serieNfse?: string;
  emitNfe?: boolean;
  emitNfce?: boolean;
  emitNfse?: boolean;
  codigoMunicipioIbge?: string;
  codigoServicoLc116Padrao?: string;
  codigoNbsPadrao?: string;
  spedyModoEmissao?: string;
  certificadoInfo?: string;
  nfseAmbienteNacional?: boolean | null;
  active?: boolean;
  notes?: string;
};

function toSummary(config: {
  provedor: ProvedorFiscal;
  provedorServicos: ProvedorFiscal | null;
  ambiente: AmbienteFiscal;
  regimeTributario: RegimeTributario;
  baseUrl: string | null;
  tokenCriptografado: string | null;
  cscId: string | null;
  cscTokenCriptografado: string | null;
  nfceIdCsc: string | null;
  nfceCscCriptografado: string | null;
  serieNfe: string;
  serieNfce: string;
  serieNfse: string;
  emitirNfe: boolean;
  emitirNfce: boolean;
  emitirNfse: boolean;
  codigoMunicipioIbge: string | null;
  codigoServicoLc116Padrao: string | null;
  codigoNbsPadrao: string | null;
  spedyModoEmissao: string | null;
  certificadoInfo: string | null;
  logotipoInfo: string | null;
  nfseAmbienteNacional: boolean | null;
  ativo: boolean;
  testadoEm: Date | null;
  ultimoErro: string | null;
  observacoes: string | null;
} | null): FiscalConfigSummary {
  return {
    configured: Boolean(config),
    provider: config?.provedor ?? "MANUAL",
    provedorServicos: config?.provedorServicos ?? null,
    environment: config?.ambiente ?? "HOMOLOGACAO",
    regime: config?.regimeTributario ?? "SIMPLES_NACIONAL",
    baseUrl: config?.baseUrl ?? "",
    tokenLast4: config?.tokenCriptografado ? secretLastChars(decryptSecret(config.tokenCriptografado)) : null,
    hasToken: Boolean(config?.tokenCriptografado),
    cscId: config?.cscId ?? "",
    hasCscToken: Boolean(config?.cscTokenCriptografado),
    nfceIdCsc: config?.nfceIdCsc ?? "",
    hasNfceCsc: Boolean(config?.nfceCscCriptografado),
    serieNfe: config?.serieNfe ?? "1",
    serieNfce: config?.serieNfce ?? "1",
    serieNfse: config?.serieNfse ?? "1",
    emitNfe: config?.emitirNfe ?? true,
    emitNfce: config?.emitirNfce ?? false,
    emitNfse: config?.emitirNfse ?? false,
    codigoMunicipioIbge: config?.codigoMunicipioIbge ?? "",
    codigoServicoLc116Padrao: config?.codigoServicoLc116Padrao ?? "",
    codigoNbsPadrao: config?.codigoNbsPadrao ?? "",
    spedyModoEmissao: config?.spedyModoEmissao ?? "COMPLETO",
    certificadoInfo: config?.certificadoInfo ?? "",
    logotipoInfo: config?.logotipoInfo ?? "",
    nfseAmbienteNacional: config?.nfseAmbienteNacional ?? null,
    active: config?.ativo ?? false,
    testedAt: config?.testadoEm?.toISOString() ?? null,
    lastError: config?.ultimoErro ?? null,
    notes: config?.observacoes ?? ""
  };
}

export async function getFiscalConfig(scope: TenantScope): Promise<FiscalConfigSummary> {
  const config = await prisma.configuracaoFiscal.findUnique({
    where: { empresaId: scope.empresaId }
  });
  return toSummary(config);
}

export async function saveFiscalConfig(scope: TenantScope, input: SaveFiscalConfigInput): Promise<FiscalConfigSummary> {
  // A escolha de provedor é GLOBAL (/admin/provedor-fiscal). Quando o chamador não informa o provider
  // (fluxo da empresa), herda o ativo da plataforma e NÃO valida credenciais por empresa (são globais).
  const provider = (input.provider ?? (await getProvedorFiscalAtivo())) as ProvedorFiscal;

  // Validação de credenciais por empresa só no fluxo LEGADO em que o provider é escolhido aqui.
  if (input.provider) {
    const externalProvider = !["MANUAL", "INTERNO"].includes(input.provider);
    if (externalProvider && input.active) {
      const existing = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId } });
      const willHaveToken = Boolean(input.token?.trim()) || Boolean(existing?.tokenCriptografado);
      if (input.provider === "SPEDY") {
        if (!willHaveToken) throw new Error("Para ativar a Spedy informe a chave de API (X-Api-Key) no campo token.");
      } else if (input.provider === "FOCUS_NFE") {
        if (!willHaveToken) throw new Error("Para ativar a Focus NFe informe o token de integração.");
      } else if (input.provider === "ACBR") {
        const willHaveClientId = Boolean(input.cscId?.trim()) || Boolean(existing?.cscId);
        if (!willHaveToken || !willHaveClientId) throw new Error("Para ativar a ACBr informe o client_id e o client_secret.");
      } else {
        const willHaveUrl = Boolean(input.baseUrl?.trim()) || Boolean(existing?.baseUrl);
        if (!willHaveToken || !willHaveUrl) throw new Error("Para ativar um provedor externo informe a URL base e o token de integração.");
      }
    }
  }

  const tokenData = input.token?.trim() ? { tokenCriptografado: encryptSecret(input.token.trim()) } : {};
  const cscData = input.cscToken?.trim() ? { cscTokenCriptografado: encryptSecret(input.cscToken.trim()) } : {};
  const nfceCscData = input.nfceCsc?.trim() ? { nfceCscCriptografado: encryptSecret(input.nfceCsc.trim()) } : {};

  // Provedor de NFS-e: só altera quando o chamador envia (undefined = mantém o atual).
  const provedorServicosData =
    input.provedorServicos !== undefined ? { provedorServicos: input.provedorServicos || null } : {};

  const config = await prisma.configuracaoFiscal.upsert({
    where: { empresaId: scope.empresaId },
    update: {
      provedor: provider,
      ...provedorServicosData,
      ambiente: input.environment,
      regimeTributario: input.regime,
      baseUrl: input.baseUrl?.trim() || null,
      cscId: input.cscId?.trim() || null,
      nfceIdCsc: input.nfceIdCsc?.trim() || null,
      serieNfe: input.serieNfe?.trim() || "1",
      serieNfce: input.serieNfce?.trim() || "1",
      serieNfse: input.serieNfse?.trim() || "1",
      emitirNfe: input.emitNfe ?? true,
      emitirNfce: input.emitNfce ?? false,
      emitirNfse: input.emitNfse ?? false,
      codigoMunicipioIbge: input.codigoMunicipioIbge?.trim() || null,
      codigoServicoLc116Padrao: input.codigoServicoLc116Padrao?.trim() || null,
      codigoNbsPadrao: input.codigoNbsPadrao?.trim() || null,
      spedyModoEmissao: input.spedyModoEmissao?.trim() || "COMPLETO",
      nfseAmbienteNacional: input.nfseAmbienteNacional ?? null,
      certificadoInfo: input.certificadoInfo?.trim() || null,
      ativo: input.active ?? false,
      observacoes: input.notes?.trim() || null,
      ultimoErro: null,
      ...tokenData,
      ...cscData,
      ...nfceCscData
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      provedor: provider,
      provedorServicos: input.provedorServicos ?? null,
      ambiente: input.environment,
      regimeTributario: input.regime,
      baseUrl: input.baseUrl?.trim() || null,
      cscId: input.cscId?.trim() || null,
      nfceIdCsc: input.nfceIdCsc?.trim() || null,
      serieNfe: input.serieNfe?.trim() || "1",
      serieNfce: input.serieNfce?.trim() || "1",
      serieNfse: input.serieNfse?.trim() || "1",
      emitirNfe: input.emitNfe ?? true,
      emitirNfce: input.emitNfce ?? false,
      emitirNfse: input.emitNfse ?? false,
      codigoMunicipioIbge: input.codigoMunicipioIbge?.trim() || null,
      codigoServicoLc116Padrao: input.codigoServicoLc116Padrao?.trim() || null,
      codigoNbsPadrao: input.codigoNbsPadrao?.trim() || null,
      spedyModoEmissao: input.spedyModoEmissao?.trim() || "COMPLETO",
      nfseAmbienteNacional: input.nfseAmbienteNacional ?? null,
      certificadoInfo: input.certificadoInfo?.trim() || null,
      ativo: input.active ?? false,
      observacoes: input.notes?.trim() || null,
      ...tokenData,
      ...cscData,
      ...nfceCscData
    }
  });

  // ACBr: quando um novo CSC da NFC-e é informado, propaga ao cadastro da empresa na ACBr
  // (config_nfce). Best-effort: a falha aqui não impede salvar a configuração local.
  let cscWarning: string | null = null;
  if (provider === "ACBR" && input.nfceCsc?.trim() && input.nfceIdCsc?.trim() && config.tokenCriptografado) {
    const empresa = await prisma.empresa.findFirst({ where: { id: scope.empresaId, tenantId: scope.tenantId } });
    if (empresa) {
      try {
        const result = await updateAcbrNfceCsc(
          {
            ambiente: config.ambiente,
            provedor: "ACBR",
            baseUrl: config.baseUrl,
            token: decryptSecret(config.tokenCriptografado),
            cscId: config.cscId,
            cscToken: null
          },
          empresa.cnpj,
          input.nfceIdCsc.trim(),
          input.nfceCsc.trim()
        );
        if (!result.ok) cscWarning = result.message;
      } catch (e) {
        cscWarning = e instanceof Error ? e.message : "Não foi possível enviar o CSC à ACBr agora.";
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await createAuditLog(tx, {
      scope,
      entidade: "ConfiguracaoFiscal",
      entidadeId: config.id,
      acao: "SAVE",
      // Nunca registrar o CSC; só se foi configurado.
      payload: { provider, environment: input.environment, active: config.ativo, cscNfceAtualizado: Boolean(input.nfceCsc?.trim()) }
    });
  });

  const summary = toSummary(config);
  return cscWarning ? { ...summary, lastError: cscWarning } : summary;
}

/** Carrega a configuração fiscal efetiva com o token descriptografado (uso interno na emissão). */
export async function getFiscalRuntimeConfig(scope: TenantScope) {
  const config = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId } });
  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId, tenantId: scope.tenantId }
  });

  if (!empresa) {
    throw new Error("Empresa não encontrada para emissão fiscal.");
  }

  // O PROVEDOR e as credenciais são da PLATAFORMA (escolhidos pelo dono do SaaS no /admin), por
  // AMBIENTE. Empresas marcadas como INTERNO/MANUAL mantêm o provedor interno; as demais usam o
  // provedor ATIVO da plataforma. Env/config da empresa ficam só como fallback retrocompatível.
  const ambiente = config?.ambiente ?? "HOMOLOGACAO";
  const provedorAtivo = await getProvedorFiscalAtivo();
  // Empresa SEM config fiscal salva herda o provedor ATIVO da plataforma (ex.: ACBr) — antes caía em
  // MANUAL e bloqueava certificado/emissão. Quem salvou explicitamente INTERNO/MANUAL mantém o interno.
  const provedorEmpresa = config?.provedor ?? provedorAtivo;
  const provider = (provedorEmpresa === "INTERNO" || provedorEmpresa === "MANUAL" ? provedorEmpresa : provedorAtivo) as ProvedorFiscal;
  const usaPlataforma = provider !== "INTERNO" && provider !== "MANUAL";
  const isOauth = provedorCred(provider) === "oauth";
  const plataforma = usaPlataforma ? await getCredenciaisProvedorPlataforma(provider, ambiente) : null;

  // OAuth (ACBr): token = client_secret, cscId = client_id. Token-based: token = chave de API.
  const tokenRuntime = isOauth
    ? plataforma?.clientSecret ?? process.env.ACBR_CLIENT_SECRET?.trim() ?? null
    : plataforma?.token ?? (config?.tokenCriptografado ? decryptSecret(config.tokenCriptografado) : null);
  const cscIdRuntime = isOauth
    ? plataforma?.clientId ?? process.env.ACBR_CLIENT_ID?.trim() ?? null
    : config?.cscId ?? null;

  // Provedor de SERVIÇOS (NFS-e): pode ser distinto do de PRODUTOS (NF-e/NFC-e). Quando a empresa
  // não define `provedorServicos`, usa o provedor de produtos resolvido acima (retrocompatível).
  const providerServicos = (config?.provedorServicos ?? provider) as ProvedorFiscal;

  // O provedor NACIONAL (NFS-e direto na SEFIN) assina o DPS + faz mTLS com o certificado A1 da
  // empresa. Só carregamos o certificado quando ele é realmente o provedor de serviços resolvido.
  const certificado = providerServicos === "NACIONAL" ? await carregarCertificado(scope) : null;

  return {
    provider,
    providerServicos,
    certificado,
    ambiente,
    regime: config?.regimeTributario ?? empresa.regimeTributario,
    baseUrl: plataforma?.baseUrl ?? config?.baseUrl ?? null,
    emissionMode: config?.spedyModoEmissao ?? "COMPLETO",
    nfseAmbienteNacional: config?.nfseAmbienteNacional ?? null,
    token: tokenRuntime,
    cscId: cscIdRuntime,
    cscToken: config?.cscTokenCriptografado ? decryptSecret(config.cscTokenCriptografado) : null,
    nfceIdCsc: config?.nfceIdCsc ?? null,
    nfceCsc: config?.nfceCscCriptografado ? decryptSecret(config.nfceCscCriptografado) : null,
    serieNfe: config?.serieNfe ?? "1",
    serieNfce: config?.serieNfce ?? "1",
    serieNfse: config?.serieNfse ?? "1",
    active: config?.ativo ?? true,
    emitter: {
      razaoSocial: empresa.razaoSocial,
      cnpj: empresa.cnpj,
      inscricaoEstadual: empresa.inscricaoEstadual,
      inscricaoMunicipal: empresa.inscricaoMunicipal,
      uf: empresa.enderecoUf,
      codigoMunicipioIbge: config?.codigoMunicipioIbge ?? empresa.codigoMunicipioIbge ?? null
    }
  };
}

export type TestFiscalConnectionResult = { ok: boolean; message: string };

/**
 * Testa as credenciais do provedor fiscal configurado, sem emitir nenhum documento.
 * Usa a configuração persistida (token descriptografado) e o `testConnection` do provedor.
 */
/**
 * Cadastra/atualiza a empresa emitente na ACBr por API (sem abrir o console), com os dados do
 * nosso cadastro. Só para o provedor ACBr. Idempotente (atualiza se já existir).
 */
export async function sincronizarEmpresaAcbr(scope: TenantScope): Promise<{ ok: boolean; message: string }> {
  const runtime = await getFiscalRuntimeConfig(scope);
  if (runtime.provider !== "ACBR") {
    return { ok: false, message: "A sincronização de empresa por API está disponível apenas para o provedor ACBr." };
  }
  if (!runtime.token) {
    return { ok: false, message: "Configure a credencial da ACBr (token) antes de sincronizar a empresa." };
  }

  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: scope.empresaId } });

  const res = await registrarEmpresaAcbr(
    {
      ambiente: runtime.ambiente,
      provedor: runtime.provider,
      baseUrl: runtime.baseUrl,
      emissionMode: runtime.emissionMode,
      token: runtime.token,
      cscId: runtime.cscId,
      cscToken: runtime.cscToken
    },
    {
      cpf_cnpj: empresa.cnpj,
      nome_razao_social: empresa.razaoSocial,
      nome_fantasia: empresa.nomeFantasia,
      inscricao_estadual: empresa.inscricaoEstadual,
      inscricao_municipal: empresa.inscricaoMunicipal,
      fone: empresa.telefone,
      email: empresa.email,
      endereco: {
        logradouro: empresa.enderecoLogradouro,
        numero: empresa.enderecoNumero,
        complemento: empresa.enderecoComplemento,
        bairro: empresa.enderecoBairro,
        codigo_municipio: empresa.codigoMunicipioIbge,
        cidade: empresa.enderecoCidade,
        uf: empresa.enderecoUf,
        cep: empresa.enderecoCep
      }
    }
  );

  await createAuditLog(prisma, {
    scope,
    entidade: "Empresa",
    entidadeId: scope.empresaId,
    acao: res.created ? "fiscal.acbr_empresa_criada" : "fiscal.acbr_empresa_atualizada",
    payload: { ok: res.ok, cnpj: empresa.cnpj }
  });

  return { ok: res.ok, message: res.message };
}

export async function testFiscalConnection(scope: TenantScope): Promise<TestFiscalConnectionResult> {
  const runtime = await getFiscalRuntimeConfig(scope);

  if (runtime.provider === "MANUAL" || runtime.provider === "INTERNO") {
    return { ok: true, message: "Provedor interno/homologação não requer credenciais externas." };
  }
  if (!runtime.token) {
    return { ok: false, message: "Nenhum token configurado. Salve a credencial do provedor antes de testar." };
  }

  const provider = resolveFiscalProvider(runtime.provider);
  if (!provider.testConnection) {
    return { ok: false, message: "Teste de conexão ainda não disponível para este provedor." };
  }

  try {
    const result = await provider.testConnection({
      ambiente: runtime.ambiente,
      provedor: runtime.provider,
      baseUrl: runtime.baseUrl,
      emissionMode: runtime.emissionMode,
      token: runtime.token,
      cscId: runtime.cscId,
      cscToken: runtime.cscToken
    });
    // Registra o último resultado para diagnóstico (sem expor o token).
    await prisma.configuracaoFiscal.update({
      where: { empresaId: scope.empresaId },
      data: { testadoEm: new Date(), ultimoErro: result.ok ? null : result.message }
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao testar conexão com o provedor.";
    return { ok: false, message };
  }
}
