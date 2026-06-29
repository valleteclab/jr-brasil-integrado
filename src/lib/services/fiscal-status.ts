/**
 * Saúde dos serviços de emissão fiscal — para o painel do dono do SaaS em /admin/status-fiscal.
 *
 * - SEFAZ (NF-e 55) e SVRS (NFC-e 65): consulta o `statusServico` REAL (cStat 107 = em operação),
 *   exercitando o caminho completo (SOAP 1.2 + mTLS com o A1). Usa o certificado de uma empresa por
 *   (UF, ambiente) — o status do serviço é o mesmo para todas as empresas daquela autorizadora.
 * - SEFIN (NFS-e Nacional) e ACBr: check de conectividade (o host responde?), sem mTLS.
 * - Resumo das emissões das últimas 24h por provedor/modelo (do banco).
 */
import type { AmbienteFiscal } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/security/secret-crypto";
import { consultarStatusServico } from "@/domains/fiscal/providers/sefaz-provider";
import { getProvedorFiscalAtivo } from "@/domains/fiscal/application/plataforma-provedor-use-cases";

export type ServicoStatus = {
  servico: string;
  detalhe: string | null;     // UF/ambiente ou host
  online: boolean;
  cStat: string | null;
  mensagem: string;
  tempoMs: number;
};

export type EmissaoResumo = { provedor: string; modelo: string; total: number; autorizadas: number; rejeitadas: number; outras: number };

export type FiscalStatusResult = {
  provedorAtivo: string;
  verificadoEm: string;
  servicos: ServicoStatus[];
  resumo24h: EmissaoResumo[];
};

const ambLabel = (a: string) => (a === "PRODUCAO" ? "Produção" : "Homologação");

async function checkSefaz(
  uf: string,
  ambiente: AmbienteFiscal,
  cert: { pfx: Buffer; senha: string },
  modelo: "55" | "65",
  servico: string,
  detalhe: string
): Promise<ServicoStatus> {
  const t0 = Date.now();
  try {
    const r = await consultarStatusServico(uf, ambiente, cert, modelo);
    return {
      servico,
      detalhe,
      online: r.cStat === "107",
      cStat: r.cStat || null,
      mensagem: `${r.cStat} ${r.xMotivo}`.trim() || `HTTP ${r.statusCode}`,
      tempoMs: Date.now() - t0
    };
  } catch (e) {
    return { servico, detalhe, online: false, cStat: null, mensagem: e instanceof Error ? e.message : String(e), tempoMs: Date.now() - t0 };
  }
}

/** Conectividade simples (host no ar?) — qualquer resposta HTTP conta como online. */
async function checkHttp(servico: string, url: string): Promise<ServicoStatus> {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    clearTimeout(to);
    return { servico, detalhe: new URL(url).host, online: true, cStat: null, mensagem: `HTTP ${res.status}`, tempoMs: Date.now() - t0 };
  } catch (e) {
    return { servico, detalhe: new URL(url).host, online: false, cStat: null, mensagem: e instanceof Error ? e.message : String(e), tempoMs: Date.now() - t0 };
  }
}

export async function getFiscalStatus(): Promise<FiscalStatusResult> {
  const provedorAtivo = await getProvedorFiscalAtivo().catch(() => "—");

  // Empresas com certificado A1 → 1 par (UF, ambiente) por autorizadora (status é compartilhado).
  const certs = await prisma.certificadoDigital.findMany({ select: { empresaId: true, tenantId: true, pfxCriptografado: true, senhaCriptografada: true } });
  const servicos: ServicoStatus[] = [];
  const vistos = new Set<string>();

  for (const c of certs) {
    const [empresa, cfg] = await Promise.all([
      prisma.empresa.findUnique({ where: { id: c.empresaId }, select: { enderecoUf: true } }),
      prisma.configuracaoFiscal.findUnique({ where: { empresaId: c.empresaId }, select: { ambiente: true } })
    ]);
    const uf = (empresa?.enderecoUf ?? "").toUpperCase();
    const ambiente = (cfg?.ambiente ?? "HOMOLOGACAO") as AmbienteFiscal;
    const chave = `${uf}|${ambiente}`;
    if (!uf || vistos.has(chave)) continue;
    vistos.add(chave);

    let cert: { pfx: Buffer; senha: string };
    try {
      cert = { pfx: Buffer.from(decryptSecret(c.pfxCriptografado), "base64"), senha: decryptSecret(c.senhaCriptografada) };
    } catch {
      continue;
    }
    const det = `${uf} · ${ambLabel(ambiente)}`;
    servicos.push(await checkSefaz(uf, ambiente, cert, "55", `NF-e (SEFAZ ${uf})`, det));
    servicos.push(await checkSefaz(uf, ambiente, cert, "65", "NFC-e (SVRS)", det));
  }

  // SEFIN (NFS-e Nacional) e ACBr — conectividade.
  const [sefin, acbr] = await Promise.all([
    checkHttp("NFS-e (SEFIN Nacional)", "https://sefin.nfse.gov.br/sefinnacional/swagger/index.html"),
    checkHttp("ACBr (API)", "https://auth.acbr.api.br/")
  ]);
  servicos.push(sefin, acbr);

  // Resumo das emissões das últimas 24h.
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const grupos = await prisma.notaFiscal.groupBy({
    by: ["provedor", "modelo", "status"],
    where: { criadoEm: { gte: desde } },
    _count: { _all: true }
  });
  const mapa = new Map<string, EmissaoResumo>();
  for (const g of grupos) {
    const k = `${g.provedor}|${g.modelo}`;
    const r = mapa.get(k) ?? { provedor: g.provedor, modelo: g.modelo, total: 0, autorizadas: 0, rejeitadas: 0, outras: 0 };
    const n = g._count._all;
    r.total += n;
    if (g.status === "AUTORIZADA") r.autorizadas += n;
    else if (g.status === "REJEITADA" || g.status === "ERRO") r.rejeitadas += n;
    else r.outras += n;
    mapa.set(k, r);
  }

  return {
    provedorAtivo,
    verificadoEm: new Date().toISOString(),
    servicos,
    resumo24h: [...mapa.values()].sort((a, b) => b.total - a.total)
  };
}
