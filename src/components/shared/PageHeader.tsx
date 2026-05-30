import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

export function PageHeader({ action, children, eyebrow, title }: PageHeaderProps) {
  return (
    <header className="erp-page-head">
      <div>
        {eyebrow && <div className="erp-crumbs">{eyebrow}</div>}
        <h1 className="erp-page-title">{title}</h1>
        {children && <div className="erp-page-sub">{children}</div>}
      </div>
      {action && <div className="erp-page-actions">{action}</div>}
    </header>
  );
}
