import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import JSZip from "jszip";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

/**
 * PACOTE DO CONTADOR: ZIP com os XMLs das notas do mês (autorizadas/canceladas/substituídas) para
 * mandar ao contador. O XML fica salvo em NotaFiscal.xml como GZip+Base64 (padrão da NFS-e
 * nacional) ou Base64/texto puro — tenta os três formatos.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function decodificarXml(bruto: string): string | null {
  try {
    const buf = Buffer.from(bruto, "base64");
    // GZip começa com 0x1f 0x8b.
    if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString("utf-8");
    const texto = buf.toString("utf-8");
    if (texto.includes("<")) return texto;
  } catch { /* não era base64 */ }
  return bruto.includes("<") ? bruto : null;
}

export async function GET(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const url = new URL(request.url);
    const agora = new Date();
    const mes = Math.min(12, Math.max(1, Number(url.searchParams.get("mes")) || agora.getMonth() + 1));
    const ano = Math.max(2000, Number(url.searchParams.get("ano")) || agora.getFullYear());
    const inicio = new Date(ano, mes - 1, 1);
    const fim = new Date(ano, mes, 1);

    const notas = await prisma.notaFiscal.findMany({
      where: {
        ...scopedByTenantCompanyAmbiente(scope),
        status: { in: ["AUTORIZADA", "CANCELADA", "SUBSTITUIDA"] },
        emitidaEm: { gte: inicio, lt: fim }
      },
      select: { numero: true, numeroNfse: true, modelo: true, status: true, chaveAcesso: true, xml: true },
      orderBy: { emitidaEm: "asc" }
    });

    const zip = new JSZip();
    let incluidos = 0;
    const semXml: string[] = [];
    for (const n of notas) {
      const nome = `${n.modelo}-${(n.chaveAcesso ?? n.numeroNfse ?? n.numero ?? "nota").replace(/[^\w-]/g, "")}${n.status !== "AUTORIZADA" ? `-${n.status}` : ""}.xml`;
      const xml = n.xml ? decodificarXml(n.xml) : null;
      if (xml) {
        zip.file(nome, xml);
        incluidos++;
      } else {
        semXml.push(nome);
      }
    }
    if (semXml.length) {
      zip.file("_AVISO-notas-sem-xml.txt", `Estas notas não têm XML armazenado no sistema:\n${semXml.join("\n")}\n`);
    }
    zip.file(
      "_RESUMO.txt",
      `Pacote do contador — ${String(mes).padStart(2, "0")}/${ano}\nNotas no período: ${notas.length}\nXMLs incluídos: ${incluidos}\nGerado em: ${new Date().toLocaleString("pt-BR")}\n`
    );

    const conteudo = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return new NextResponse(new Uint8Array(conteudo), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="xmls-${ano}-${String(mes).padStart(2, "0")}.zip"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar o pacote.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}
