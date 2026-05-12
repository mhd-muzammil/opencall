function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export interface MetricsGridItem {
  label: string;
  value: number;
  detail: string;
  tone?: "accent" | "blue" | "warn" | "danger";
  onClick?: () => void;
  isActive?: boolean;
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
          <span>{item.label}</span>
          <strong>{formatNumber(item.value)}</strong>
          <small>{item.detail}</small>
        </div>
      ))}
    </div>
  );
}
