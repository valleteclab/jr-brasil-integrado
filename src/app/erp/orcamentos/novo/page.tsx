import { redirect } from "next/navigation";

export default function NovoOrcamentoPage() {
  redirect("/erp/atendimento?tipo=ORCAMENTO");
}
