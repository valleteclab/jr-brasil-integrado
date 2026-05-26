import { Card } from "./Card";

type KpiCardProps = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warn" | "danger" | "info";
};

export function KpiCard({ label, value, tone = "default" }: KpiCardProps) {
  return (
    <Card className={`metric tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}
