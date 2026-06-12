// Presentational metric components extracted from app/page.tsx (Phase 4).
// Props-only, JSX preserved verbatim — no behavior changes.
import { formatNumber } from "../utils";

export function Metric({
  label,
  value,
  onClick,
  isActive,
}: Readonly<{
  label: string;
  value: string | number;
  onClick?: () => void;
  isActive?: boolean;
}>) {
  const displayValue = typeof value === "number" ? formatNumber(value) : value;

  return (
    <div
      className="metric"
      onClick={onClick}
      style={
        onClick
          ? {
              cursor: "pointer",
              borderColor: isActive ? "var(--accent)" : undefined,
              background: isActive ? "var(--surface-subtle)" : undefined,
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
    >
      <span>{label}</span>
      <strong>{displayValue}</strong>
    </div>
  );
}

export function OverviewStat({
  label,
  value,
  detail,
  tone = "accent",
  onClick,
  isActive,
}: Readonly<{
  label: string;
  value: number;
  detail: string;
  tone?: "accent" | "blue" | "warn" | "danger";
  onClick?: () => void;
  isActive?: boolean;
}>) {
  return (
    <div
      className={`overviewStat ${tone} ${isActive ? "active" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
      <small>{detail}</small>
    </div>
  );
}
