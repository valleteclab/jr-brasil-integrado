import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { getEmailRuntime, sendEmail, type EmailAttachment } from "@/lib/email/smtp-client";
import { getWhatsappRuntime, sendWhatsappDocument, sendWhatsappText } from "@/lib/whatsapp/zapi-client";
import { getOrcamentoParaImpressao } from "@/domains/sales-quote/application/quote-use-cases";
import { pdfDoBoleto } from "@/domains/finance/application/boleto-use-cases";
import { downloadNotaFiscalDocumento } from "@/domains/fiscal/application/fiscal-emission-use-cases";

/**
 * ENVIO DE DOCUMENTOS AO CLIENTE FINAL (orçamento, boleto, nota fiscal) por E-MAIL e WHATSAPP.
 *
 * - E-mail: SMTP da empresa (ConfiguracaoEmail); PDF vai como anexo.
 * - WhatsApp: Z-API da empresa (ConfiguracaoWhatsapp); PDF vai como documento (base64) +
 *   mensagem de texto com o resumo. Orçamento vai como mensagem formatada (não há PDF).
 * - Destinatário padrão: contato PRINCIPAL do cliente (ClienteContato); a tela pode sobrepor.
 * - Cada envio é auditado; falha em um canal não impede o outro (resultado por canal).
 */

export type CanalEnvio = "EMAIL" | "WHATSAPP";

export type EnvioInput = {
  canais: CanalEnvio[];
  /** Sobrepõe o e-mail do contato principal do cliente. */
  email?: string | null;
  /** Sobrepõe o WhatsApp do contato principal do cliente. */
  telefone?: string | null;
  usuarioId?: string;
};

export type EnvioResultado = {
  email?: { ok: boolean; error?: string; destinatario?: string };
  whatsapp?: { ok: boolean; error?: string; destinatario?: string };
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const dataBR = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

function esc(v: string | null | undefined): string {
  return (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Contato principal do cliente (e-mail e WhatsApp) — padrão dos destinatários. */
async function contatoDoCliente(scope: TenantScope, clienteId: string | null | undefined) {
  if (!clienteId) return { email: null as string | null, whatsapp: null as string | null };
  const contato = await prisma.clienteContato.findFirst({
    where: { clienteId, ...scopedByTenantCompany(scope) },
    orderBy: { principal: "desc" },
    select: { email: true, telefone: true, whatsapp: true }
  });
  return {
    email: contato?.email?.trim() || null,
    whatsapp: contato?.whatsapp?.trim() || contato?.telefone?.trim() || null
  };
}

async function nomeEmpresa(scope: TenantScope): Promise<string> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: { nomeFantasia: true, razaoSocial: true }
  });
  return empresa?.nomeFantasia || empresa?.razaoSocial || "Empresa";
}

/** Despacha para os canais escolhidos, audita e devolve o resultado por canal. */
async function despachar(
  scope: TenantScope,
  params: {
    input: EnvioInput;
    clienteId: string | null | undefined;
    entidade: string;
    entidadeId: string;
    assunto: string;
    corpoHtml: string;
    textoWhatsapp: string;
    anexos?: EmailAttachment[];
    /** Documento enviado no WhatsApp (PDF em base64). Sem ele, vai só o texto. */
    docWhatsapp?: { base64: string; fileName: string; caption?: string } | null;
  }
): Promise<EnvioResultado> {
  const canais = new Set(params.input.canais);
  if (!canais.size) throw new Error("Escolha ao menos um canal de envio (e-mail ou WhatsApp).");
  const contato = await contatoDoCliente(scope, params.clienteId);
  const resultado: EnvioResultado = {};

  if (canais.has("EMAIL")) {
    const destinatario = params.input.email?.trim() || contato.email;
    if (!destinatario) {
      resultado.email = { ok: false, error: "Cliente sem e-mail cadastrado — informe um e-mail." };
    } else {
      const cfg = await getEmailRuntime(scope);
      if (!cfg) {
        resultado.email = { ok: false, error: "E-mail (SMTP) não configurado. Configure em Configurações → E-mail." };
      } else {
        const r = await sendEmail(cfg, {
          to: destinatario,
          subject: params.assunto,
          html: params.corpoHtml,
          attachments: params.anexos
        });
        resultado.email = { ...r, destinatario };
      }
    }
  }

  if (canais.has("WHATSAPP")) {
    const destinatario = params.input.telefone?.trim() || contato.whatsapp;
    if (!destinatario) {
      resultado.whatsapp = { ok: false, error: "Cliente sem WhatsApp cadastrado — informe um número." };
    } else {
      const cfg = await getWhatsappRuntime(scope);
      if (!cfg || !cfg.ativo) {
        resultado.whatsapp = { ok: false, error: "WhatsApp (Z-API) não configurado/ativo." };
      } else {
        let r = await sendWhatsappText(cfg, destinatario, params.textoWhatsapp);
        if (r.ok && params.docWhatsapp) {
          r = await sendWhatsappDocument(cfg, destinatario, {
            base64: params.docWhatsapp.base64,
            fileName: params.docWhatsapp.fileName,
            caption: params.docWhatsapp.caption
          });
        }
        resultado.whatsapp = { ...r, destinatario };
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await createAuditLog(tx, {
      scope,
      usuarioId: params.input.usuarioId,
      entidade: params.entidade,
      entidadeId: params.entidadeId,
      acao: "ENVIO_CLIENTE",
      payload: {
        canais: [...canais],
        email: resultado.email ? { ok: resultado.email.ok, destinatario: resultado.email.destinatario, error: resultado.email.error } : undefined,
        whatsapp: resultado.whatsapp ? { ok: resultado.whatsapp.ok, destinatario: resultado.whatsapp.destinatario, error: resultado.whatsapp.error } : undefined
      }
    });
  });

  return resultado;
}

// ─── Orçamento ────────────────────────────────────────────────────────────────

export async function enviarOrcamento(scope: TenantScope, orcamentoId: string, input: EnvioInput): Promise<EnvioResultado> {
  const { orcamento, empresa } = await getOrcamentoParaImpressao(scope, orcamentoId);
  const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || "Empresa";
  const clienteNome = orcamento.cliente?.nomeFantasia || orcamento.cliente?.razaoSocial || "Cliente";

  const linhas = orcamento.itens.map((item) => ({
    nome: item.produto?.nome ?? "Item",
    sku: item.produto?.sku ?? "",
    quantidade: Number(item.quantidade),
    unitario: Number(item.precoUnitario),
    total: Number(item.total)
  }));
  const total = Number(orcamento.total);
  const validade = orcamento.validoAte ? dataBR(orcamento.validoAte) : null;

  const corpoHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px">
      <h2 style="margin:0 0 4px">Orçamento Nº ${esc(orcamento.numero)}</h2>
      <p style="margin:0 0 16px;color:#475569">${esc(empresaNome)}</p>
      <p>Olá, ${esc(clienteNome)}! Segue o orçamento solicitado:</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="text-align:left;padding:6px 8px;border:1px solid #e2e8f0">Produto</th>
            <th style="text-align:right;padding:6px 8px;border:1px solid #e2e8f0">Qtd</th>
            <th style="text-align:right;padding:6px 8px;border:1px solid #e2e8f0">Unitário</th>
            <th style="text-align:right;padding:6px 8px;border:1px solid #e2e8f0">Total</th>
          </tr>
        </thead>
        <tbody>
          ${linhas.map((l) => `
            <tr>
              <td style="padding:6px 8px;border:1px solid #e2e8f0">${esc(l.nome)}${l.sku ? ` <small style="color:#64748b">(${esc(l.sku)})</small>` : ""}</td>
              <td style="text-align:right;padding:6px 8px;border:1px solid #e2e8f0">${l.quantidade}</td>
              <td style="text-align:right;padding:6px 8px;border:1px solid #e2e8f0">${brl(l.unitario)}</td>
              <td style="text-align:right;padding:6px 8px;border:1px solid #e2e8f0">${brl(l.total)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      <p style="font-size:16px"><strong>Total: ${brl(total)}</strong></p>
      ${validade ? `<p>Válido até <strong>${validade}</strong>.</p>` : ""}
      ${orcamento.observacaoVendedor ? `<p style="color:#475569">${esc(orcamento.observacaoVendedor)}</p>` : ""}
      <p style="color:#64748b;font-size:12px">Qualquer dúvida, responda este e-mail ou fale conosco.</p>
    </div>`;

  const textoWhatsapp = [
    `*Orçamento Nº ${orcamento.numero}* — ${empresaNome}`,
    "",
    ...linhas.map((l) => `• ${l.quantidade}x ${l.nome} — ${brl(l.total)}`),
    "",
    `*Total: ${brl(total)}*`,
    validade ? `Válido até ${validade}.` : null,
    orcamento.observacaoVendedor ? orcamento.observacaoVendedor : null
  ].filter((l): l is string => l !== null).join("\n");

  return despachar(scope, {
    input,
    clienteId: orcamento.clienteId,
    entidade: "Orcamento",
    entidadeId: orcamento.id,
    assunto: `Orçamento Nº ${orcamento.numero} — ${empresaNome}`,
    corpoHtml,
    textoWhatsapp
  });
}

// ─── Boleto (conta a receber) ─────────────────────────────────────────────────

export async function enviarBoleto(scope: TenantScope, contaReceberId: string, input: EnvioInput): Promise<EnvioResultado> {
  const conta = await prisma.contaReceber.findFirst({
    where: { id: contaReceberId, ...scopedByTenantCompany(scope) },
    include: {
      cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      boleto: { select: { linhaDigitavel: true, status: true, vencimento: true, valor: true } }
    }
  });
  if (!conta) throw new Error("Conta a receber não encontrada.");
  if (!conta.boleto) throw new Error("Esta conta a receber não possui boleto emitido.");

  const empresaNome = await nomeEmpresa(scope);
  const clienteNome = conta.cliente?.nomeFantasia || conta.cliente?.razaoSocial || "Cliente";
  const valor = Number(conta.boleto.valor ?? conta.valor);
  const vencimento = dataBR(conta.boleto.vencimento ?? conta.vencimento);
  const linhaDigitavel = conta.boleto.linhaDigitavel;

  // PDF pode não estar disponível (ex.: sandbox Sicoob) — nesse caso segue só a linha digitável.
  let pdf: Buffer | null = null;
  try {
    pdf = await pdfDoBoleto(scope, contaReceberId);
  } catch {
    pdf = null;
  }
  if (!pdf && !linhaDigitavel) {
    throw new Error("Boleto sem PDF nem linha digitável disponíveis — sincronize o boleto no banco antes de enviar.");
  }

  const corpoHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px">
      <h2 style="margin:0 0 4px">Boleto — ${esc(conta.descricao)}</h2>
      <p style="margin:0 0 16px;color:#475569">${esc(empresaNome)}</p>
      <p>Olá, ${esc(clienteNome)}! Segue o boleto para pagamento:</p>
      <p>Valor: <strong>${brl(valor)}</strong><br/>Vencimento: <strong>${vencimento}</strong></p>
      ${linhaDigitavel ? `<p>Linha digitável:<br/><code style="font-size:14px">${esc(linhaDigitavel)}</code></p>` : ""}
      ${pdf ? "<p>O boleto em PDF segue em anexo.</p>" : ""}
      <p style="color:#64748b;font-size:12px">Após o pagamento, a baixa é automática. Qualquer dúvida, fale conosco.</p>
    </div>`;

  const textoWhatsapp = [
    `*Boleto — ${empresaNome}*`,
    conta.descricao,
    "",
    `Valor: *${brl(valor)}*`,
    `Vencimento: *${vencimento}*`,
    linhaDigitavel ? `\nLinha digitável (copia e cola):\n${linhaDigitavel}` : null
  ].filter((l): l is string => l !== null).join("\n");

  const fileName = `boleto-${(conta.numeroDocumento || conta.id.slice(-6)).replace(/[^\w.-]/g, "_")}.pdf`;

  return despachar(scope, {
    input,
    clienteId: conta.clienteId,
    entidade: "ContaReceber",
    entidadeId: conta.id,
    assunto: `Boleto ${brl(valor)} — vencimento ${vencimento} — ${empresaNome}`,
    corpoHtml,
    textoWhatsapp,
    anexos: pdf ? [{ filename: fileName, content: pdf, contentType: "application/pdf" }] : undefined,
    docWhatsapp: pdf ? { base64: pdf.toString("base64"), fileName } : null
  });
}

// ─── Nota fiscal (DANFE/DANFCE/DANFSE + XML) ─────────────────────────────────

export async function enviarNotaFiscal(scope: TenantScope, notaId: string, input: EnvioInput): Promise<EnvioResultado> {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: notaId, ...scopedByTenantCompany(scope) },
    select: {
      id: true,
      modelo: true,
      numero: true,
      numeroNfse: true,
      chaveAcesso: true,
      status: true,
      total: true,
      clienteId: true,
      destinatarioNome: true,
      destinatarioEmail: true,
      pedidoVenda: { select: { clienteId: true } }
    }
  });
  if (!nota) throw new Error("Nota fiscal não encontrada.");
  if (nota.status !== "AUTORIZADA") throw new Error("Só é possível enviar notas AUTORIZADAS ao cliente.");

  const pdfDoc = await downloadNotaFiscalDocumento(scope, notaId, "pdf");
  // XML é obrigatório por lei para o destinatário contribuinte — quando disponível, segue junto.
  let xmlDoc: { contentType: string; body: Buffer; filename: string } | null = null;
  try {
    xmlDoc = await downloadNotaFiscalDocumento(scope, notaId, "xml");
  } catch {
    xmlDoc = null;
  }

  const empresaNome = await nomeEmpresa(scope);
  const numeroExibicao = nota.numeroNfse || nota.numero || "—";
  const clienteId = nota.clienteId ?? nota.pedidoVenda?.clienteId ?? null;
  const destinatarioNome = nota.destinatarioNome || "Cliente";
  const total = Number(nota.total ?? 0);

  const corpoHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px">
      <h2 style="margin:0 0 4px">Nota fiscal ${esc(nota.modelo)} Nº ${esc(numeroExibicao)}</h2>
      <p style="margin:0 0 16px;color:#475569">${esc(empresaNome)}</p>
      <p>Olá, ${esc(destinatarioNome)}! Segue a nota fiscal da sua compra${total > 0 ? ` no valor de <strong>${brl(total)}</strong>` : ""}.</p>
      ${nota.chaveAcesso ? `<p>Chave de acesso:<br/><code style="font-size:13px">${esc(nota.chaveAcesso)}</code></p>` : ""}
      <p>O PDF${xmlDoc ? " e o XML seguem" : " segue"} em anexo.</p>
      <p style="color:#64748b;font-size:12px">Guarde este documento. Qualquer dúvida, fale conosco.</p>
    </div>`;

  const textoWhatsapp = [
    `*Nota fiscal ${nota.modelo} Nº ${numeroExibicao}* — ${empresaNome}`,
    total > 0 ? `Valor: *${brl(total)}*` : null,
    nota.chaveAcesso ? `Chave de acesso: ${nota.chaveAcesso}` : null,
    "O PDF da nota segue abaixo. 📎"
  ].filter((l): l is string => l !== null).join("\n");

  const anexos: EmailAttachment[] = [{ filename: pdfDoc.filename, content: pdfDoc.body, contentType: pdfDoc.contentType }];
  if (xmlDoc) anexos.push({ filename: xmlDoc.filename, content: xmlDoc.body, contentType: xmlDoc.contentType });

  // Destinatário de e-mail: override da tela → e-mail do destinatário da NF → contato do cliente.
  const inputComDestinatarioNota: EnvioInput = {
    ...input,
    email: input.email?.trim() || nota.destinatarioEmail || null
  };

  return despachar(scope, {
    input: inputComDestinatarioNota,
    clienteId,
    entidade: "NotaFiscal",
    entidadeId: nota.id,
    assunto: `Nota fiscal ${nota.modelo} Nº ${numeroExibicao} — ${empresaNome}`,
    corpoHtml,
    textoWhatsapp,
    anexos,
    docWhatsapp: { base64: pdfDoc.body.toString("base64"), fileName: pdfDoc.filename }
  });
}
