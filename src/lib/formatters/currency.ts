export const brlFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

export function formatBrl(value: number) {
  return brlFormatter.format(value);
}
