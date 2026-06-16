import type { ReactNode } from "react";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export interface MetricsGridItem {
  label: string;
  value: number | string;
  detail: string | ReactNode;
  tone?: "accent" | "blue" | "warn" | "danger";
  onClick?: () => void;
  isActive?: boolean;
  customRender?: () => ReactNode;
}

export function MetricsGrid({ items }: Readonly<{ items: readonly MetricsGridItem[] }>) {
  return (
    <div className="overviewStatsGrid metricsGrid">
      {items.map((item) => (
        <div
          className={`overviewStat ${item.tone ?? "accent"} ${item.isActive ? "active" : ""}`}
          key={item.label}
          onClick={item.onClick}
          role={item.onClick ? "button" : undefined}
        >
          {item.customRender ? (
            item.customRender()
          ) : (
            <>
              <span>{item.label}</span>
              <strong>{typeof item.value === "number" ? formatNumber(item.value) : item.value}</strong>
              {typeof item.detail === "string" ? (
                <small>{item.detail}</small>
              ) : (
                item.detail
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
