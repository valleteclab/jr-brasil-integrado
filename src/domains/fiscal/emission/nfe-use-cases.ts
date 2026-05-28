import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { calcularImpostos, somarTotaisNfe, type RegimeEmpresa } from "@/domains/fiscal/calculation/tax-calculator";

// ─── Input types ─────────────────────────────────────────────────────────────

export type NfeItemInput = {
  produtoId?: string;
  seq: number;
  descricao: string;
  ncm?: string;
  cest?: string;
  cfop: string;
  unidade: string;
  gtin?: string;
  origem?: string;
  quantidade: number;
  valorUnitario: number;
  valorBruto: number;
  valorDesconto?: number;
  valorFrete?: number;
  // Fiscal — preenchido pelo motor ou manualmente
  icmsCST?: string;
  icmsCSOSN?: string;
  icmsAliquota?: number;
  icmsReducaoBC?: number;
  icmsSTMVA?: number;
  icmsSTAliquota?: number;
  fcpAliquota?: number;
  ipiCST?: string;
  ipiCodEnq?: string;
  ipiAliquota?: number;
  pisCST?: string;
  pisAliquota?: number;
  cofinsCST?: string;
  cofinsAliquota?: number;
};

export type NfePagamentoInput = {
  forma: string;
  valor: number;
  bandeira?: string;
  cnpjCred?: string;
  tpIntegr?: string;
};

export type NfeCreateInput = {
  clienteId?: string;
  naturezaOperacao: string;
  tipoNF?: number;
  finalidade?: number;
  consumidorFinal?: number;
  presencaComprador?: number;
  serie?: string;
  dataEmissao?: string;
  dataSaida?: string;
  modalidadeFrete?: number;
  valorFrete?: number;
  valorSeguro?: number;
  valorOutras?: number;
  infAdic?: string;
  infCpl?: string;
  itens: NfeItemInput[];
  pagamentos: NfePagamentoInput[];
  // Regime da empresa emitente para motor de cálculo
  regimeEmpresa?: RegimeEmpresa;
  ufOrigem?: string;
  ufDestino?: string;
};

export type NfeUpdateInput = Partial<NfeCreateInput>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDecimal(v: unknown): number {
  return Number(v) || 0;
}

function buildItemTaxFields(item: NfeItemInput, regime: RegimeEmpresa, ufOrigem: string, ufDestino: string) {
  const calc = calcularImpostos({
    regime,
    ufOrigem,
    ufDestino,
    tipoDestinatario: "CONTRIBUINTE_ICMS",
    valorBruto: item.valorBruto,
    desconto: item.valorDesconto ?? 0,
    frete: item.valorFrete ?? 0,
    icmsCST: item.icmsCST,
    icmsCSOSN: item.icmsCSOSN,
    icmsAliquota: item.icmsAliquota,
    icmsReducaoBC: item.icmsReducaoBC,
    icmsSTMVA: item.icmsSTMVA,
    icmsSTAliquota: item.icmsSTAliquota,
    fcpAliquota: item.fcpAliquota,
    ipiCST: item.ipiCST,
    ipiAliquota: item.ipiAliquota,
    pisCST: item.pisCST,
    pisAliquota: item.pisAliquota,
    cofinsCST: item.cofinsCST,
    cofinsAliquota: item.cofinsAliquota
  });

  return {
    icmsBC: calc.icms.baseCalculo,
    icmsAliquota: item.icmsAliquota ?? 0,
    icmsValor: calc.icms.valor,
    icmsSTBC: calc.icmsST?.baseCalculo ?? 0,
    icmsSTMVA: item.icmsSTMVA ?? 0,
    icmsSTAliquota: item.icmsSTAliquota ?? 0,
    icmsSTValor: calc.icmsST?.valor ?? 0,
    fcpAliquota: item.fcpAliquota ?? 0,
    fcpValor: calc.fcp?.valor ?? 0,
    ipiAliquota: item.ipiAliquota ?? 0,
    ipiValor: calc.ipi?.valor ?? 0,
    pisBC: item.valorBruto - (item.valorDesconto ?? 0),
    pisAliquota: item.pisAliquota ?? 0,
    pisValor: calc.pis.valor,
    cofinsBC: item.valorBruto - (item.valorDesconto ?? 0),
    cofinsAliquota: item.cofinsAliquota ?? 0,
    cofinsValor: calc.cofins.valor,
    totalTributos: calc.totalTributos,
    _calc: calc
  };
}

// ─── Use cases ───────────────────────────────────────────────────────────────

export async function createNfe(input: NfeCreateInput): Promise<{ id: string }> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const scope = await getDevelopmentTenantScope();
  const regime: RegimeEmpresa = input.regimeEmpresa ?? "REGIME_NORMAL";
  const ufOrigem = input.ufOrigem ?? "BA";
  const ufDestino = input.ufDestino ?? ufOrigem;

  // Calculate taxes for each item
  const itensComImposto = input.itens.map((item) => {
    const tax = buildItemTaxFields(item, regime, ufOrigem, ufDestino);
    return { item, tax };
  });

  // Aggregate totals
  const totais = somarTotaisNfe(
    itensComImposto.map(({ item, tax }) => ({
      valorBruto: item.valorBruto,
      desconto: item.valorDesconto ?? 0,
      frete: item.valorFrete ?? 0,
      calculo: tax._calc
    }))
  );

  const valorFrete = parseDecimal(input.valorFrete);
  const valorSeguro = parseDecimal(input.valorSeguro);
  const valorOutras = parseDecimal(input.valorOutras);

  const nfTotal = totais.vNF + valorFrete + valorSeguro + valorOutras;

  const nf = await prisma.$transaction(async (tx) => {
    const created = await tx.notaFiscal.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        status: "RASCUNHO",
        clienteId: input.clienteId ?? null,
        naturezaOperacao: input.naturezaOperacao,
        tipoNF: input.tipoNF ?? 1,
        finalidade: input.finalidade ?? 1,
        consumidorFinal: input.consumidorFinal ?? 0,
        presencaComprador: input.presencaComprador ?? 1,
        serie: input.serie ?? "001",
        dataEmissao: input.dataEmissao ? new Date(input.dataEmissao) : null,
        dataSaida: input.dataSaida ? new Date(input.dataSaida) : null,
        modalidadeFrete: input.modalidadeFrete ?? 9,
        valorProdutos: totais.vProd,
        valorDesconto: totais.vDesc,
        valorFrete,
        valorSeguro,
        valorOutras,
        valorBCICMS: totais.vBC,
        valorICMS: totais.vICMS,
        valorBCICMSST: totais.vBCST,
        valorICMSST: totais.vICMSST,
        valorFCP: totais.vFCP,
        valorIPI: totais.vIPI,
        valorPIS: totais.vPIS,
        valorCOFINS: totais.vCOFINS,
        valorTributos: totais.vTotTrib,
        total: nfTotal,
        infAdic: input.infAdic ?? null,
        infCpl: input.infCpl ?? null
      } as Parameters<typeof tx.notaFiscal.create>[0]["data"]
    });

    // Insert items
    for (const { item, tax } of itensComImposto) {
      await tx.notaFiscalItem.create({
        data: {
          tenantId: scope.tenantId,
          notaFiscalId: created.id,
          produtoId: item.produtoId ?? null,
          seq: item.seq,
          descricao: item.descricao,
          ncm: item.ncm ?? null,
          cest: item.cest ?? null,
          cfop: item.cfop,
          unidade: item.unidade,
          gtin: item.gtin ?? null,
          origem: item.origem ?? "0",
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          valorBruto: item.valorBruto,
          valorDesconto: item.valorDesconto ?? 0,
          valorFrete: item.valorFrete ?? 0,
          icmsCST: item.icmsCST ?? null,
          icmsCSOSN: item.icmsCSOSN ?? null,
          icmsBC: tax.icmsBC,
          icmsAliquota: tax.icmsAliquota,
          icmsValor: tax.icmsValor,
          icmsSTBC: tax.icmsSTBC || null,
          icmsSTMVA: tax.icmsSTMVA || null,
          icmsSTAliquota: tax.icmsSTAliquota || null,
          icmsSTValor: tax.icmsSTValor || null,
          fcpAliquota: tax.fcpAliquota || null,
          fcpValor: tax.fcpValor || null,
          ipiCST: item.ipiCST ?? null,
          ipiCodEnq: item.ipiCodEnq ?? null,
          ipiAliquota: tax.ipiAliquota || null,
          ipiValor: tax.ipiValor || null,
          pisCST: item.pisCST ?? null,
          pisBC: tax.pisBC,
          pisAliquota: tax.pisAliquota,
          pisValor: tax.pisValor,
          cofinsCST: item.cofinsCST ?? null,
          cofinsBC: tax.cofinsBC,
          cofinsAliquota: tax.cofinsAliquota,
          cofinsValor: tax.cofinsValor,
          totalTributos: tax.totalTributos
        }
      });
    }

    // Insert payments
    for (const pag of input.pagamentos) {
      await tx.notaFiscalPagamento.create({
        data: {
          notaFiscalId: created.id,
          forma: pag.forma,
          valor: pag.valor,
          bandeira: pag.bandeira ?? null,
          cnpjCred: pag.cnpjCred ?? null,
          tpIntegr: pag.tpIntegr ?? null
        }
      });
    }

    await tx.auditoria.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        entidade: "NotaFiscal",
        entidadeId: created.id,
        acao: "CRIAR",
        payload: JSON.stringify({ status: "RASCUNHO", total: nfTotal })
      }
    });

    return created;
  });

  return { id: nf.id };
}

export async function updateNfe(id: string, input: NfeUpdateInput): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const scope = await getDevelopmentTenantScope();

  const existing = await prisma.notaFiscal.findFirst({
    where: { id, ...scopedByTenantCompany(scope) }
  });

  if (!existing) throw new Error("NF-e não encontrada.");
  if (existing.status !== "RASCUNHO") throw new Error("Somente rascunhos podem ser editados.");

  const regime: RegimeEmpresa = input.regimeEmpresa ?? "REGIME_NORMAL";
  const ufOrigem = input.ufOrigem ?? "BA";
  const ufDestino = input.ufDestino ?? ufOrigem;

  await prisma.$transaction(async (tx) => {
    // Delete and recreate items/payments if provided
    if (input.itens) {
      await tx.notaFiscalItem.deleteMany({ where: { notaFiscalId: id } });
      await tx.notaFiscalPagamento.deleteMany({ where: { notaFiscalId: id } });

      const itensComImposto = input.itens.map((item) => {
        const tax = buildItemTaxFields(item, regime, ufOrigem, ufDestino);
        return { item, tax };
      });

      const totais = somarTotaisNfe(
        itensComImposto.map(({ item, tax }) => ({
          valorBruto: item.valorBruto,
          desconto: item.valorDesconto ?? 0,
          frete: item.valorFrete ?? 0,
          calculo: tax._calc
        }))
      );

      const valorFrete = parseDecimal(input.valorFrete);
      const valorSeguro = parseDecimal(input.valorSeguro);
      const valorOutras = parseDecimal(input.valorOutras);

      await tx.notaFiscal.update({
        where: { id },
        data: {
          clienteId: input.clienteId ?? undefined,
          naturezaOperacao: input.naturezaOperacao,
          tipoNF: input.tipoNF,
          finalidade: input.finalidade,
          consumidorFinal: input.consumidorFinal,
          presencaComprador: input.presencaComprador,
          dataEmissao: input.dataEmissao ? new Date(input.dataEmissao) : undefined,
          dataSaida: input.dataSaida ? new Date(input.dataSaida) : undefined,
          modalidadeFrete: input.modalidadeFrete,
          valorProdutos: totais.vProd,
          valorDesconto: totais.vDesc,
          valorFrete,
          valorSeguro,
          valorOutras,
          valorBCICMS: totais.vBC,
          valorICMS: totais.vICMS,
          valorBCICMSST: totais.vBCST,
          valorICMSST: totais.vICMSST,
          valorFCP: totais.vFCP,
          valorIPI: totais.vIPI,
          valorPIS: totais.vPIS,
          valorCOFINS: totais.vCOFINS,
          valorTributos: totais.vTotTrib,
          total: totais.vNF + valorFrete + valorSeguro + valorOutras,
          infAdic: input.infAdic ?? undefined,
          infCpl: input.infCpl ?? undefined
        } as Parameters<typeof tx.notaFiscal.update>[0]["data"]
      });

      for (const { item, tax } of itensComImposto) {
        await tx.notaFiscalItem.create({
          data: {
            tenantId: scope.tenantId,
            notaFiscalId: id,
            produtoId: item.produtoId ?? null,
            seq: item.seq,
            descricao: item.descricao,
            ncm: item.ncm ?? null,
            cest: item.cest ?? null,
            cfop: item.cfop,
            unidade: item.unidade,
            gtin: item.gtin ?? null,
            origem: item.origem ?? "0",
            quantidade: item.quantidade,
            valorUnitario: item.valorUnitario,
            valorBruto: item.valorBruto,
            valorDesconto: item.valorDesconto ?? 0,
            valorFrete: item.valorFrete ?? 0,
            icmsCST: item.icmsCST ?? null,
            icmsCSOSN: item.icmsCSOSN ?? null,
            icmsBC: tax.icmsBC,
            icmsAliquota: tax.icmsAliquota,
            icmsValor: tax.icmsValor,
            icmsSTBC: tax.icmsSTBC || null,
            icmsSTMVA: tax.icmsSTMVA || null,
            icmsSTAliquota: tax.icmsSTAliquota || null,
            icmsSTValor: tax.icmsSTValor || null,
            fcpAliquota: tax.fcpAliquota || null,
            fcpValor: tax.fcpValor || null,
            ipiCST: item.ipiCST ?? null,
            ipiCodEnq: item.ipiCodEnq ?? null,
            ipiAliquota: tax.ipiAliquota || null,
            ipiValor: tax.ipiValor || null,
            pisCST: item.pisCST ?? null,
            pisBC: tax.pisBC,
            pisAliquota: tax.pisAliquota,
            pisValor: tax.pisValor,
            cofinsCST: item.cofinsCST ?? null,
            cofinsBC: tax.cofinsBC,
            cofinsAliquota: tax.cofinsAliquota,
            cofinsValor: tax.cofinsValor,
            totalTributos: tax.totalTributos
          }
        });
      }

      for (const pag of input.pagamentos ?? []) {
        await tx.notaFiscalPagamento.create({
          data: {
            notaFiscalId: id,
            forma: pag.forma,
            valor: pag.valor,
            bandeira: pag.bandeira ?? null,
            cnpjCred: pag.cnpjCred ?? null,
            tpIntegr: pag.tpIntegr ?? null
          }
        });
      }
    }

    await tx.auditoria.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        entidade: "NotaFiscal",
        entidadeId: id,
        acao: "ATUALIZAR",
        payload: JSON.stringify({ editada: true })
      }
    });
  });
}

export async function deleteNfeDraft(id: string): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const scope = await getDevelopmentTenantScope();

  const existing = await prisma.notaFiscal.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    select: { status: true }
  });

  if (!existing) throw new Error("NF-e não encontrada.");
  if (existing.status !== "RASCUNHO") throw new Error("Somente rascunhos podem ser excluídos.");

  await prisma.$transaction(async (tx) => {
    await tx.notaFiscalItem.deleteMany({ where: { notaFiscalId: id } });
    await tx.notaFiscalPagamento.deleteMany({ where: { notaFiscalId: id } });
    await tx.notaFiscal.delete({ where: { id } });
    await tx.auditoria.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        entidade: "NotaFiscal",
        entidadeId: id,
        acao: "EXCLUIR",
        payload: JSON.stringify({ status: "RASCUNHO" })
      }
    });
  });
}

// Returns the structured JSON payload ready to send to a fiscal API
export async function buildNfePayload(id: string): Promise<Record<string, unknown>> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const scope = await getDevelopmentTenantScope();

  const nf = await prisma.notaFiscal.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: { itens: { orderBy: { seq: "asc" } }, pagamentos: true }
  }) as Record<string, unknown> | null;

  if (!nf) throw new Error("NF-e não encontrada.");

  const empresa = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: {
      razaoSocial: true, nomeFantasia: true, cnpj: true,
      inscricaoEstadual: true, inscricaoMunicipal: true
    }
  });

  let destinatario: Record<string, unknown> | null = null;
  if (nf.clienteId) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: nf.clienteId as string },
      include: { enderecos: { where: { padrao: true }, take: 1 } }
    });
    if (cliente) {
      const end = cliente.enderecos[0];
      destinatario = {
        xNome: cliente.razaoSocial,
        CNPJ: cliente.documento.replace(/\D/g, "").length === 14 ? cliente.documento.replace(/\D/g, "") : undefined,
        CPF: cliente.documento.replace(/\D/g, "").length === 11 ? cliente.documento.replace(/\D/g, "") : undefined,
        IE: cliente.inscricaoEstadual ?? undefined,
        enderDest: end ? {
          xLgr: end.logradouro, nro: end.numero ?? "S/N",
          xBairro: end.bairro ?? "", cMun: "",
          xMun: end.cidade, UF: end.uf, CEP: end.cep.replace(/\D/g, "")
        } : undefined
      };
    }
  }

  return {
    ide: {
      cUF: 29,
      natOp: nf.naturezaOperacao,
      mod: 55,
      serie: nf.serie ?? "001",
      tpNF: nf.tipoNF ?? 1,
      idDest: 1,
      tpEmis: 1,
      finNFe: nf.finalidade ?? 1,
      indFinal: nf.consumidorFinal ?? 0,
      indPres: nf.presencaComprador ?? 1
    },
    emit: {
      CNPJ: empresa?.cnpj?.replace(/\D/g, "") ?? "",
      xNome: empresa?.razaoSocial ?? "",
      xFant: empresa?.nomeFantasia ?? undefined,
      IE: empresa?.inscricaoEstadual ?? undefined,
      IM: empresa?.inscricaoMunicipal ?? undefined
    },
    dest: destinatario,
    det: ((nf.itens ?? []) as Record<string, unknown>[]).map((item, idx) => ({
      nItem: idx + 1,
      prod: {
        cProd: item.produtoId ?? String(idx + 1),
        cEAN: (item.gtin as string) || "SEM GTIN",
        xProd: item.descricao,
        NCM: item.ncm ?? "",
        CEST: item.cest ?? undefined,
        CFOP: item.cfop,
        uCom: item.unidade,
        qCom: item.quantidade,
        vUnCom: item.valorUnitario,
        vProd: item.valorBruto,
        vDesc: item.valorDesconto || undefined
      },
      imposto: {
        ICMS: item.icmsCST ? {
          ICMS00: item.icmsCST === "00" ? {
            orig: item.origem ?? "0", CST: "00",
            vBC: item.icmsBC, pICMS: item.icmsAliquota, vICMS: item.icmsValor
          } : undefined
        } : item.icmsCSOSN ? {
          ICMSSN400: item.icmsCSOSN === "400" ? { orig: item.origem ?? "0", CSOSN: "400" } : undefined
        } : undefined,
        PIS: { PISAliq: { CST: item.pisCST ?? "07", vBC: item.pisBC, pPIS: item.pisAliquota, vPIS: item.pisValor } },
        COFINS: { COFINSAliq: { CST: item.cofinsCST ?? "07", vBC: item.cofinsBC, pCOFINS: item.cofinsAliquota, vCOFINS: item.cofinsValor } }
      }
    })),
    total: {
      ICMSTot: {
        vBC: nf.valorBCICMS ?? 0, vICMS: nf.valorICMS ?? 0,
        vICMSDeson: 0, vFCP: nf.valorFCP ?? 0,
        vBCST: nf.valorBCICMSST ?? 0, vST: nf.valorICMSST ?? 0,
        vFCPST: 0, vFCPSTRet: 0,
        vProd: nf.valorProdutos ?? 0, vFrete: nf.valorFrete ?? 0,
        vSeg: nf.valorSeguro ?? 0, vDesc: nf.valorDesconto ?? 0,
        vII: 0, vIPI: nf.valorIPI ?? 0, vIPIDevol: 0,
        vPIS: nf.valorPIS ?? 0, vCOFINS: nf.valorCOFINS ?? 0,
        vOutro: nf.valorOutras ?? 0, vNF: nf.total,
        vTotTrib: nf.valorTributos ?? 0
      }
    },
    transp: { modFrete: nf.modalidadeFrete ?? 9 },
    pag: {
      detPag: ((nf.pagamentos ?? []) as Record<string, unknown>[]).map((p) => ({
        tPag: p.forma, vPag: p.valor
      }))
    },
    infAdic: nf.infAdic ? { infCpl: nf.infAdic } : undefined
  };
}
