import type { ReactNode } from "react";
import { ErpShell } from "@/components/erp/ErpShell";

export default function ErpLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <ErpShell>{children}</ErpShell>;
}
