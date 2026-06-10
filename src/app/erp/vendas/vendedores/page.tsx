import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { VendedoresManager } from "@/components/erp/VendedoresManager";
import { listVendedores } from "@/domains/sales/application/comissao-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession } from "@/lib/auth/session";
import { isAdminPerfil } from "@/lib/auth/modules";

export const dynamic = "force-dynamic";

export default async function VendedoresPage() {
  const scope = await getDevelopmentTenantScope();
  const [vendedores, session] = await Promise.all([listVendedores(scope), getSession()]);
  const isAdmin = isAdminPerfil(session?.perfilNome ?? "");

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        title="Vendedores"
        action={<Link className="btn-erp ghost sm" href="/erp/vendas">← Vendas</Link>}
      >
        <p>Cadastro de vendedores e percentual de comissão (gerada na confirmação da venda).</p>
      </PageHeader>
      <VendedoresManager
        vendedores={vendedores.map((v) => ({
          id: v.id,
          nome: v.nome,
          email: v.email,
          percentualComissao: Number(v.percentualComissao),
          ativo: v.ativo
        }))}
        isAdmin={isAdmin}
      />
    </>
  );
}
