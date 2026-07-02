/**
 * SIMULAÇÃO PONTA A PONTA — ST INTERESTADUAL (remetente substituto, Conv. ICMS 142/2018) + GNRE.
 *
 * Faz TUDO em HOMOLOGAÇÃO (aborta se a empresa estiver em produção):
 *  1. Cadastra (idempotente, prefixo TESTE-ST): produto ST (NCM 8708 autopeças, icmsSt=true) e a
 *     REGRA TRIBUTÁRIA do protocolo (ICMS, NCM + UF destino + MVA original + alíq. interna destino);
 *  2. Emite a NF-e interestadual (avulsa, sem estoque) para o destinatário informado — testando
 *     pelos DOIS provedores (SEFAZ direto e ACBr), alternando o provedor global e RESTAURANDO no fim;
 *  3. Relata por provedor: status/cStat, chave, CSOSN/CFOP do item, MVA/BC-ST/vICMSST e a guia
 *     GNRE gerada (deve aparecer PENDENTE para a UF de destino quando autorizada).
 *
 * Uso:
 *   npx tsx scripts/simular-st-interestadual.ts --empresa=<id|cnpj> \
 *     --cliente-cnpj=<CNPJ real> --cliente-ie=<IE real vinculada> --cliente-uf=<UF> \
 *     [--cliente-nome="..."] [--cidade="..."] [--ibge=<7 dígitos>] [--cep=...] \
 *     [--mva=71.78] [--aliq-st=18] [--valor=100] [--provedores=SEFAZ,ACBR]
 *
 * IMPORTANTE: a SEFAZ valida IE×CNPJ mesmo em homologação (cStat 234 se não vinculada) — use um
 * cliente REAL de outro estado (contribuinte com IE ativa). A nota de homologação não tem valor
 * fiscal e o nome do destinatário é substituído pelo aviso padrão.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db/prisma";
import { emitProductInvoiceAvulsa } from "../src/domains/fiscal/application/standalone-emission-use-cases";
import { encryptSecret } from "../src/lib/security/secret-crypto";
import type { TenantScope } from "../src/lib/auth/dev-session";

const arg = (k: string, d = "") => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const dig = (v: string) => v.replace(/\D+/g, "");

async function main() {
  const empresaArg = arg("empresa");
  const clienteCnpj = dig(arg("cliente-cnpj"));
  const clienteIe = dig(arg("cliente-ie"));
  const clienteUf = arg("cliente-uf").toUpperCase();
  if (!empresaArg || !clienteCnpj || !clienteIe || !clienteUf) {
    throw new Error("Obrigatórios: --empresa=<id|cnpj> --cliente-cnpj= --cliente-ie= --cliente-uf= (cliente REAL de outra UF, com IE ativa).");
  }
  const mva = Number(arg("mva", "71.78"));
  const aliqSt = Number(arg("aliq-st", "18"));
  const valor = Number(arg("valor", "100"));
  const provedores = arg("provedores", "SEFAZ,ACBR").split(",").map((p) => p.trim().toUpperCase()).filter(Boolean);
  const NCM = dig(arg("ncm", "87089990"));

  // ── Empresa + trava de ambiente ──
  // --empresa aceita o id (cuid) ou o CNPJ (14 dígitos).
  const cnpjEmpresa = dig(empresaArg);
  const empresa = await prisma.empresa.findFirst({
    where: cnpjEmpresa.length === 14 ? { cnpj: cnpjEmpresa } : { id: empresaArg }
  });
  if (!empresa) throw new Error(`Empresa não encontrada: ${empresaArg}`);
  const configFiscal = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: empresa.id } });
  const ambiente = configFiscal?.ambiente ?? "HOMOLOGACAO";
  if (ambiente !== "HOMOLOGACAO") {
    throw new Error(`ABORTADO: a empresa ${empresa.razaoSocial} está em ${ambiente}. A simulação só roda em HOMOLOGAÇÃO.`);
  }
  if (clienteUf === (empresa.enderecoUf ?? "").toUpperCase()) {
    throw new Error(`O cliente informado é da MESMA UF da empresa (${clienteUf}) — a simulação é de venda INTERESTADUAL.`);
  }
  const scope = { tenantId: empresa.tenantId, empresaId: empresa.id, ambiente } as TenantScope;
  console.log(`Empresa: ${empresa.razaoSocial} (${empresa.enderecoUf}) · ambiente ${ambiente}`);
  console.log(`Destino: ${clienteUf} · CNPJ ${clienteCnpj} IE ${clienteIe} · NCM ${NCM} · MVA ${mva}% · alíq. ST ${aliqSt}%`);

  // ── 0. A1 opcional (--pfx=... --pfx-pass=...): grava o certificado da empresa no banco de
  //       teste quando ele ainda não existe lá (o provedor SEFAZ exige o A1 para assinar). ──
  const pfxPath = arg("pfx");
  if (pfxPath) {
    const senha = arg("pfx-pass") || process.env.PFX_PASS || "";
    if (!senha) throw new Error("Informe --pfx-pass= (ou PFX_PASS) junto com --pfx=.");
    const pfx = readFileSync(pfxPath);
    await prisma.certificadoDigital.upsert({
      where: { empresaId: scope.empresaId },
      update: { pfxCriptografado: encryptSecret(pfx.toString("base64")), senhaCriptografada: encryptSecret(senha), arquivoNome: pfxPath.split(/[\\/]/).pop() ?? "a1.pfx" },
      create: {
        tenantId: scope.tenantId, empresaId: scope.empresaId,
        pfxCriptografado: encryptSecret(pfx.toString("base64")), senhaCriptografada: encryptSecret(senha),
        arquivoNome: pfxPath.split(/[\\/]/).pop() ?? "a1.pfx"
      }
    });
    console.log("Certificado A1 carregado no banco para a empresa (via --pfx).");
  }

  // ── 1. Produto ST de teste (idempotente) ──
  const sku = "TESTE-ST-8708";
  let produto = await prisma.produto.findFirst({ where: { tenantId: scope.tenantId, empresaId: scope.empresaId, sku } });
  if (!produto) {
    const categoria =
      (await prisma.produtoCategoria.findFirst({ where: { tenantId: scope.tenantId, empresaId: scope.empresaId } })) ??
      (await prisma.produtoCategoria.create({ data: { tenantId: scope.tenantId, empresaId: scope.empresaId, nome: "TESTE ST", slug: "teste-st" } }));
    produto = await prisma.produto.create({
      data: {
        tenantId: scope.tenantId, empresaId: scope.empresaId, sku, categoriaId: categoria.id,
        nome: "TESTE ST - Parachoque dianteiro (simulação)", unidade: "UN",
        precoVenda: valor, ncm: NCM, origem: "0", ativo: true
      }
    });
    console.log(`Produto criado: ${sku}`);
  } else {
    console.log(`Produto já existia: ${sku}`);
  }
  await prisma.produtoFiscal.upsert({
    where: { produtoId: produto.id },
    update: { ncm: NCM, icmsSt: true, pisCofinsMonofasico: true },
    create: { tenantId: scope.tenantId, empresaId: scope.empresaId, produtoId: produto.id, ncm: NCM, icmsSt: true, pisCofinsMonofasico: true }
  });
  console.log("Perfil fiscal: icmsSt=true (substituído) + monofásico.");

  // ── 2. Regra tributária do protocolo (NCM + UF destino + MVA ORIGINAL) ──
  const nomeRegra = `TESTE-ST ${NCM} → ${clienteUf}`;
  const regraExistente = await prisma.regraTributaria.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, nome: nomeRegra }
  });
  if (regraExistente) {
    await prisma.regraTributaria.update({ where: { id: regraExistente.id }, data: { mva, aliquotaIcmsSt: aliqSt, ativo: true } });
    console.log(`Regra atualizada: ${nomeRegra}`);
  } else {
    await prisma.regraTributaria.create({
      data: {
        tenantId: scope.tenantId, empresaId: scope.empresaId, nome: nomeRegra,
        tributo: "ICMS", operacao: "VENDA", ncm: NCM, ufDestino: clienteUf,
        mva, aliquotaIcmsSt: aliqSt, ativo: true, vigenciaInicio: new Date("2020-01-01")
      }
    });
    console.log(`Regra criada: ${nomeRegra} (MVA original ${mva}%, alíq. interna destino ${aliqSt}%)`);
  }

  // ── 3. Emissão pelos provedores ──
  const plataforma = await prisma.plataformaConfiguracao.upsert({
    where: { id: "default" }, update: {}, create: { id: "default" }
  });
  const provedorOriginal = plataforma.provedorFiscalAtivo;
  console.log(`\nProvedor global atual: ${provedorOriginal} (será restaurado ao final)\n`);

  const resultados: Array<Record<string, unknown>> = [];
  try {
    for (const provedor of provedores) {
      console.log(`${"─".repeat(60)}\n▶ Emitindo pelo provedor ${provedor}…`);
      await prisma.plataformaConfiguracao.update({ where: { id: "default" }, data: { provedorFiscalAtivo: provedor } });
      try {
        const nota = await emitProductInvoiceAvulsa(scope, {
          modelo: "NFE",
          naturezaOperacao: "VENDA DE MERCADORIA",
          receiver: {
            nome: arg("cliente-nome", "CLIENTE TESTE ST INTERESTADUAL"),
            documento: clienteCnpj,
            inscricaoEstadual: clienteIe,
            endereco: {
              logradouro: "Rua Teste", numero: "100", bairro: "Centro",
              cep: dig(arg("cep", "01310100")), cidade: arg("cidade", "Sao Paulo"),
              uf: clienteUf, codigoMunicipioIbge: dig(arg("ibge", "3550308"))
            }
          },
          formaPagamento: "Dinheiro",
          itens: [{ produtoId: produto.id, quantidade: 1, precoUnitario: valor }],
          baixarEstoque: false
        });
        const notaDb = await prisma.notaFiscal.findUnique({
          where: { id: nota.id },
          include: { itens: { select: { csosn: true, cstIcms: true, cfop: true, percentualMva: true, baseIcmsSt: true, valorIcmsSt: true } }, guiasRecolhimento: true }
        });
        const item = notaDb?.itens[0];
        const guia = notaDb?.guiasRecolhimento[0];
        const r = {
          provedor,
          status: nota.status,
          motivo: nota.motivo ?? null,
          chave: nota.chaveAcesso ?? null,
          csosn: item?.csosn ?? item?.cstIcms ?? null,
          cfop: item?.cfop ?? null,
          mva: item?.percentualMva != null ? Number(item.percentualMva) : null,
          baseSt: item?.baseIcmsSt != null ? Number(item.baseIcmsSt) : null,
          valorSt: item?.valorIcmsSt != null ? Number(item.valorIcmsSt) : null,
          totalNota: notaDb ? Number(notaDb.total) : null,
          guiaGnre: guia ? { uf: guia.ufFavorecida, valor: Number(guia.valor), status: guia.status } : null
        };
        resultados.push(r);
        console.log(JSON.stringify(r, null, 1));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        resultados.push({ provedor, status: "ERRO", motivo: msg });
        console.log(`✖ ${provedor}: ${msg}`);
      }
    }
  } finally {
    await prisma.plataformaConfiguracao.update({ where: { id: "default" }, data: { provedorFiscalAtivo: provedorOriginal } });
    console.log(`\nProvedor global restaurado para ${provedorOriginal}.`);
  }

  // ── 4. Resumo ──
  console.log(`\n${"═".repeat(60)}\nRESUMO DA SIMULAÇÃO`);
  for (const r of resultados) {
    const st = r.status === "AUTORIZADA" ? "✔" : "✖";
    console.log(` ${st} ${r.provedor}: ${r.status}${r.motivo ? ` — ${r.motivo}` : ""}`);
    if (r.csosn) console.log(`   CSOSN/CST ${r.csosn} · CFOP ${r.cfop} · MVA ${r.mva}% · BC-ST ${r.baseSt} · vICMSST ${r.valorSt} · total ${r.totalNota}`);
    if (r.guiaGnre) console.log(`   GUIA GNRE: ${JSON.stringify(r.guiaGnre)}`);
  }
  console.log("\nEsperado: CSOSN 202 (Simples) ou CST 10, CFOP 6403, vICMSST > 0 e guia GNRE PENDENTE p/ a UF destino.");
  console.log("Cadastros de teste mantidos (prefixo TESTE-ST) — remova pelo cadastro quando quiser.");
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
