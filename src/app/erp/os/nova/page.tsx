import { redirect } from "next/navigation";

export default function NovaOsPage() {
  redirect("/erp/atendimento?tipo=OS");
}
