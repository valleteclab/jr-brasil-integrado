import type { ReactNode } from "react";
import { ErpShell } from "@/components/erp/ErpShell";
import { getErpShellContext } from "@/lib/services/erp-shell";

export const dynamic = "force-dynamic";

export default async function ErpLayout({ children }: Readonly<{ children: ReactNode }>) {
  const context = await getErpShellContext();
  return <ErpShell context={context}>{children}</ErpShell>;
}
