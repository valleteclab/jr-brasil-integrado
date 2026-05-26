import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "dark" | "light" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  href?: string;
};

export function Button({ children, className = "", href, variant = "primary", ...props }: ButtonProps) {
  const classes = `button ${variant} ${className}`.trim();

  if (href) {
    return <Link className={classes} href={href}>{children}</Link>;
  }

  return <button className={classes} {...props}>{children}</button>;
}
