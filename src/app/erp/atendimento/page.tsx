import { AtendimentoWorkspace } from "@/components/erp/AtendimentoWorkspace";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { listSaleFormData } from "@/lib/services/sales";
import type { SaleFormData } from "@/lib/services/sales";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getTenantFeatures } from "@/lib/auth/tenant-features";
import { TIPO_VENDA_FLAG, type TipoVenda } from "@/lib/auth/feature-flags";

export const dynamic = "force-dynamic";

const TIPOS = ["VENDA_BALCAO", "PEDIDO_FATURADO", "ORCAMENTO", "OS"] as const;

export default async function AtendimentoPage({ searchParams }: { searchParams: { tipo?: string } }) {
  const scope = await getDevelopmentTenantScope();
  const features = await getTenantFeatures(scope.tenantId);
  // Só os tipos de venda liberados pelo dono do SaaS aparecem (na ordem do seletor).
  const allowedTipos = TIPOS.filter((t) => features[TIPO_VENDA_FLAG[t]]) as TipoVenda[];

  if (allowedTipos.length === 0) {
    return (
      <ModuloBloqueado
        titulo="Atendimento indisponível"
        descricao="Nenhum tipo de venda está liberado para a sua conta. Fale com o suporte."
      />
    );
  }

  // O tipo pedido na URL só vale se estiver liberado; senão cai no primeiro permitido.
  const pedido = searchParams.tipo as TipoVenda | undefined;
  const defaultTipo = pedido && allowedTipos.includes(pedido) ? pedido : allowedTipos[0];

  let data: SaleFormData = { clientes: [], produtos: [], vendedores: [], formas: [], vendedorLogadoId: null, vendedorLogadoNome: null, permiteVendaDiretaBalcao: false, permiteVendaSemEstoque: false, permiteVendaNaoFiscal: false, descontoSemAutorizacaoPct: 0, contasCobranca: [] };
  let loadError = "";

  try {
    data = await listSaleFormData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os dados do atendimento.";
  }

  return (
    <>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <AtendimentoWorkspace data={data} defaultTipo={defaultTipo} allowedTipos={allowedTipos} />
    </>
  );
}
