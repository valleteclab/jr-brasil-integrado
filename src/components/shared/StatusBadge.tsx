type StatusTone = "success" | "warn" | "danger" | "info" | "violet" | "mute";

type StatusBadgeProps = {
  children: string;
  tone?: StatusTone;
};

export function StatusBadge({ children, tone = "mute" }: StatusBadgeProps) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}
