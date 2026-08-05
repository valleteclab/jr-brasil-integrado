"use client";

/**
 * Campos numéricos padronizados do ERP:
 *  - MoneyInput: moeda BRL com digitação estilo banco/PDV — só números, centavos
 *    preenchem da direita p/ esquerda ("4990" → "49,90"). Devolve string pt-BR
 *    ("1.234,56"), compatível com os parsers existentes (currencyToNumber).
 *  - PercentInput: percentual com vírgula decimal e sufixo %.
 *  - QtyStepper: quantidade com botões − / + (decimais só quando a unidade permite).
 */

const mute = "var(--erp-mute, #64748b)";

export function formatMoneyBR(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type MoneyProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function MoneyInput({ value, onChange, placeholder, disabled }: MoneyProps) {
  function handle(raw: string) {
    const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d{3})/, "").slice(0, 13);
    if (!digits) { onChange(""); return; }
    onChange(formatMoneyBR(parseInt(digits, 10)));
  }
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
      <span style={{ position: "absolute", left: 10, fontSize: 12, fontWeight: 600, color: mute, pointerEvents: "none" }}>R$</span>
      <input
        inputMode="numeric"
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? "0,00"}
        onChange={(e) => handle(e.target.value)}
        style={{ width: "100%", textAlign: "right", paddingLeft: 34, fontVariantNumeric: "tabular-nums" }}
      />
    </div>
  );
}

type PercentProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function PercentInput({ value, onChange, placeholder }: PercentProps) {
  function handle(raw: string) {
    // dígitos + uma vírgula decimal (máx. 2 casas)
    const limpo = raw.replace(/[^\d,]/g, "");
    const [inteiro, ...resto] = limpo.split(",");
    const dec = resto.join("").slice(0, 2);
    onChange(resto.length ? `${inteiro.slice(0, 3)},${dec}` : inteiro.slice(0, 3));
  }
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
      <input
        inputMode="decimal"
        value={value}
        placeholder={placeholder ?? "0"}
        onChange={(e) => handle(e.target.value)}
        style={{ width: "100%", textAlign: "right", paddingRight: 28, fontVariantNumeric: "tabular-nums" }}
      />
      <span style={{ position: "absolute", right: 10, fontSize: 12, fontWeight: 600, color: mute, pointerEvents: "none" }}>%</span>
    </div>
  );
}

type QtyProps = {
  value: string;
  onChange: (value: string) => void;
  /** Unidades fracionáveis (KG, MT, LT…) aceitam vírgula; UN/PC/CX não. */
  allowDecimal?: boolean;
  min?: number;
  disabled?: boolean;
};

const qtyToNumber = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;

export function QtyStepper({ value, onChange, allowDecimal = false, min = 0, disabled }: QtyProps) {
  function set(n: number) {
    const clamped = Math.max(min, n);
    onChange(allowDecimal ? String(clamped).replace(".", ",") : String(Math.round(clamped)));
  }
  function handle(raw: string) {
    const limpo = allowDecimal
      ? raw.replace(/[^\d,]/g, "").replace(/,(?=.*,)/g, "")
      : raw.replace(/\D/g, "");
    onChange(limpo);
  }
  const btn: React.CSSProperties = {
    width: 30, height: 30, flex: "0 0 auto", borderRadius: 8, border: "1px solid var(--erp-line, #e2e8f0)",
    background: "var(--erp-bg-soft, #f8fafc)", cursor: disabled ? "default" : "pointer", fontSize: 15, lineHeight: 1
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
      <button type="button" style={btn} disabled={disabled} aria-label="Diminuir" onClick={() => set(qtyToNumber(value) - 1)}>−</button>
      <input
        inputMode={allowDecimal ? "decimal" : "numeric"}
        value={value}
        disabled={disabled}
        onChange={(e) => handle(e.target.value)}
        style={{ width: "100%", minWidth: 0, textAlign: "center", fontVariantNumeric: "tabular-nums" }}
      />
      <button type="button" style={btn} disabled={disabled} aria-label="Aumentar" onClick={() => set(qtyToNumber(value) + 1)}>+</button>
    </div>
  );
}
