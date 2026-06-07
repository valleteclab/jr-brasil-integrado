import { redirect } from "next/navigation";
import { getLojaPadrao } from "@/lib/services/loja";

export const dynamic = "force-dynamic";

// Raiz da loja: redireciona para a primeira loja publicada (multiloja usa /loja/{slug}).
export default async function LojaRaiz() {
  const loja = await getLojaPadrao().catch(() => null);
  if (loja?.slug) redirect(`/loja/${loja.slug}`);

  return (
    <main className="store-shell">
      <div className="empty-st">
        <h4>Nenhuma loja publicada</h4>
        <p>Defina o endereço da loja em Configurações → Aparência para publicá-la.</p>
      </div>
    </main>
  );
}
