import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { CorrigirEntradasWorkspace } from "@/components/erp/CorrigirEntradasWorkspace";

export const dynamic = "force-dynamic";

// Correção em lote dos lançamentos de entrada de um mês: vínculo de produto errado e
// finalidade errada. São erros que se repetem ao longo de um período inteiro, e até aqui só
// davam para arrumar item a item, depois que a contabilidade reclamava.
export default function CorrigirEntradasPage() {
  return (
    <>
      <PageHeader
        eyebrow="Entradas fiscais"
        title="Corrigir lançamentos do mês"
        action={<Button href="/erp/entradas-fiscais" variant="light">← Entradas fiscais</Button>}
      >
        <p>
          Encontra itens lançados no produto errado e troca a finalidade de um mês inteiro. Depois de
          corrigir, gere o SPED do período novamente.
        </p>
      </PageHeader>

      <CorrigirEntradasWorkspace />
    </>
  );
}
