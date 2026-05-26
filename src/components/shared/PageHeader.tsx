import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

export function PageHeader({ action, children, eyebrow, title }: PageHeaderProps) {
  return (
    <header className="topbar-panel">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {children}
      </div>
      {action}
    </header>
  );
}
