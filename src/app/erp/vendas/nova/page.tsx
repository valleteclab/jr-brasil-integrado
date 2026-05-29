import { redirect } from "next/navigation";

export default function NovaVendaPage() {
  redirect("/erp/atendimento?tipo=VENDA_BALCAO");
}
