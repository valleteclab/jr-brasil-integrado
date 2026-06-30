import type { ModeloFiscal } from "@prisma/client";
import { getDevelopmentTenantScope, scopedByTenantCompanyAmbiente, type TenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { createZip } from "@/lib/zip/create-zip";
import { downloadNotaFiscalDocumento } from "@/domains/fiscal/application/fiscal-emission-use-cases";

const MODELO_LABEL: Record<ModeloFiscal, string> = { NFE: "NFe", NFCE: "NFCe", NFSE: "NFSe" };

function monthRange(mes?: number, ano?: number) {
  const hoje = new Date();
  const y = ano && ano > 1900 ? ano : hoje.getFullYear();
  const m = mes && mes >= 1 && mes <= 12 ? mes - 1 : hoje.getMonth();
  return {
    inicio: new Date(y, m, 1, 0, 0, 0, 0),
    fim: new Date(y, m + 1, 0, 23, 59, 59, 999),
    competencia: `${String(m + 1).padStart(2, "0")}-${y}`
  };
}

export type XmlPackageResult = {
  zip: Buffer;
  filename: string;
  total: number;
  incluidos: number;
  faltando: number;
};

/**
 * Empacota em um ZIP os XMLs das NOTAS DE SAÍDA (NF-e, NFC-e e NFS-e) AUTORIZADAS ou
 * CANCELADAS no mês de competência, para envio ao contador. Reaproveita o XML salvo na nota
 * quando existe; senão, baixa do provedor (ACBr, server-side com Bearer). Inclui um índice
 * (indice.csv) com o que entrou e o que faltou. Escopado por tenant+empresa.
 */
export async function buildOutboundXmlPackage(
  params?: { mes?: number; ano?: number },
  scopeArg?: TenantScope
): Promise<XmlPackageResult> {
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const { inicio, fim, competencia } = monthRange(params?.mes, params?.ano);

  const notas = await prisma.notaFiscal.findMany({
    where: {
      // Pacote do contador: apenas notas do ambiente vigente (homologação não vai pro contador).
      ...scopedByTenantCompanyAmbiente(scope),
      emitidaEm: { gte: inicio, lte: fim },
      status: { in: ["AUTORIZADA", "CANCELADA"] }
    },
    orderBy: { emitidaEm: "asc" },
    select: {
      id: true, modelo: true, numero: true, numeroNfse: true, serie: true, status: true,
      chaveAcesso: true, providerRef: true, xml: true, emitidaEm: true,
      destinatarioNome: true, total: true
    }
  });

  const arquivos: Array<{ name: string; content: string | Buffer }> = [];
  const indice: string[] = ["modelo;numero;serie;status;chave;emissao;destinatario;total;xml"];
  let incluidos = 0;
  let faltando = 0;

  for (const n of notas) {
    const baseNome = `${MODELO_LABEL[n.modelo]}-${n.serie ?? "1"}-${n.numeroNfse ?? n.numero ?? n.id}`;
    let xml: string | null = n.xml?.trim() ? n.xml : null;

    // Sem XML salvo: tenta baixar do provedor (requer providerRef).
    if (!xml && n.providerRef) {
      try {
        const r = await downloadNotaFiscalDocumento(scope, n.id, "xml");
        xml = r.body.toString("utf8");
      } catch {
        xml = null;
      }
    }

    const temXml = Boolean(xml);
    if (temXml && xml) {
      const nome = n.chaveAcesso ? `${n.chaveAcesso}.xml` : `${baseNome}.xml`;
      arquivos.push({ name: nome, content: xml });
      incluidos++;
    } else {
      faltando++;
    }

    indice.push([
      MODELO_LABEL[n.modelo], n.numeroNfse ?? n.numero ?? "", n.serie ?? "", n.status,
      n.chaveAcesso ?? "", n.emitidaEm ? n.emitidaEm.toISOString().slice(0, 10) : "",
      (n.destinatarioNome ?? "").replace(/;/g, ","), Number(n.total).toFixed(2),
      temXml ? "incluido" : "indisponivel"
    ].join(";"));
  }

  arquivos.push({ name: "indice.csv", content: indice.join("\n") });

  return {
    zip: createZip(arquivos),
    filename: `xml-saidas-${competencia}.zip`,
    total: notas.length,
    incluidos,
    faltando
  };
}
