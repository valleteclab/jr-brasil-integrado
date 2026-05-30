import type { RetencaoTributo, RetencoesFiscais } from "./types";

/**
 * Helpers fiscais de NFS-e reutilizados pela emissão avulsa e pelo faturamento de OS:
 * cálculo de retenções na fonte e distribuição da base/alíquota de ISS por serviço.
 */

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Alíquota (%) de uma retenção federal informada na emissão. */
export type RetencaoFederalInput = { aliquota?: number | null };

export type RetencoesInput = {
  issRetido?: boolean;
  ir?: RetencaoFederalInput | null;
  pis?: RetencaoFederalInput | null;
  cofins?: RetencaoFederalInput | null;
  csll?: RetencaoFederalInput | null;
  inss?: RetencaoFederalInput | null;
  /** Base de cálculo das retenções federais (quando diferente do valor dos serviços). */
  baseRetencao?: number | null;
};

/** Parâmetros de ISS informados na emissão (alíquota, deduções e base). */
export type IssInput = {
  aliquotaIss?: number | null;
  deducoes?: number | null;
  baseCalculoIss?: number | null;
};

/**
 * Calcula as retenções a partir do valor dos serviços e das alíquotas informadas.
 * A base das retenções federais pode ser sobreposta por `input.baseRetencao`.
 */
export function computeRetencoes(valorServicos: number, input?: RetencoesInput | null): RetencoesFiscais | null {
  if (!input) return null;
  const baseCalc = input.baseRetencao != null && input.baseRetencao > 0 ? round2(input.baseRetencao) : valorServicos;
  const calc = (r?: RetencaoFederalInput | null): RetencaoTributo | null => {
    const aliquota = Number(r?.aliquota ?? 0);
    if (!aliquota || aliquota <= 0) return null;
    return { aliquota, valor: round2(baseCalc * (aliquota / 100)) };
  };
  const ir = calc(input.ir);
  const pis = calc(input.pis);
  const cofins = calc(input.cofins);
  const csll = calc(input.csll);
  const inss = calc(input.inss);
  const issRetido = Boolean(input.issRetido);

  if (!ir && !pis && !cofins && !csll && !inss && !issRetido) return null;

  const totalFederal = round2(
    (ir?.valor ?? 0) + (pis?.valor ?? 0) + (cofins?.valor ?? 0) + (csll?.valor ?? 0) + (inss?.valor ?? 0)
  );
  return {
    issRetido,
    ir,
    pis,
    cofins,
    csll,
    inss,
    totalRetido: totalFederal,
    valorLiquido: round2(valorServicos - totalFederal)
  };
}

/**
 * Resolve a alíquota e a base de ISS de um serviço, distribuindo a base total
 * (valor dos serviços − deduções, ou base informada) proporcionalmente ao valor do serviço.
 * Retorna `null` quando não há ISS informado (o motor usa a regra tributária).
 */
export function issPorServico(
  valorServicos: number,
  valorServico: number,
  iss?: IssInput | null
): { aliquotaIss: number | null; baseIss: number | null } {
  const aliquota = iss?.aliquotaIss != null && iss.aliquotaIss > 0 ? iss.aliquotaIss : null;
  const deducoes = iss?.deducoes != null && iss.deducoes > 0 ? round2(iss.deducoes) : 0;
  const baseInformada = iss?.baseCalculoIss != null && iss.baseCalculoIss > 0 ? round2(iss.baseCalculoIss) : null;
  const baseTotal = baseInformada ?? round2(Math.max(valorServicos - deducoes, 0));
  const distribuir = aliquota != null && (deducoes > 0 || baseInformada != null) && valorServicos > 0;
  return {
    aliquotaIss: aliquota,
    baseIss: distribuir ? round2(baseTotal * (valorServico / valorServicos)) : null
  };
}
