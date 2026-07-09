import { useState } from "react";
import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { saveRecordLayout, resetRecordLayout } from "../../../lib/recordLayoutApiClient";

const CATALOG = DAILY_CALL_PLAN_COLUMNS as readonly string[];

// Display label overrides (the stored key stays the same as the report column).
const LABEL_OVERRIDE: Record<string, string> = {
  "RTPL status": "Morning status",
};

interface ColumnItem {
  column: string;
  visible: boolean;
}

function buildInitial(orderedColumns: string[] | null): ColumnItem[] {
  if (!orderedColumns || orderedColumns.length === 0) {
    return CATALOG.map((column) => ({ column, visible: true }));
  }
  const inLayout = orderedColumns.filter((c) => CATALOG.includes(c));
  const rest = CATALOG.filter((c) => !inLayout.includes(c));
  return [
    ...inLayout.map((column) => ({ column, visible: true })),
    ...rest.map((column) => ({ column, visible: false })),
  ];
}

export function RecordFormatPage({
  token,
  initialColumns,
  onSaved,
}: Readonly<{
  token: string;
  initialColumns: string[] | null;
  onSaved: (orderedColumns: string[] | null) => void;
}>) {
  const [items, setItems] = useState<ColumnItem[]>(() => buildInitial(initialColumns));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const move = (index: number, dir: -1 | 1) => {
    setItems((cur) => {
      const j = index + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next;
    });
  };

  const toggle = (index: number) => {
    setItems((cur) => cur.map((it, i) => (i === index ? { ...it, visible: !it.visible } : it)));
  };

  const visibleColumns = items.filter((it) => it.visible).map((it) => it.column);

  const handleSave = async () => {
    if (visibleColumns.length === 0) {
      setMessage("Keep at least one column visible.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveRecordLayout(token, visibleColumns);
      onSaved(visibleColumns);
      setMessage("Saved — your Records page now uses this layout.");
    } catch (error) {
      setMessage(`Save failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await resetRecordLayout(token);
      onSaved(null);
      setItems(buildInitial(null));
      setMessage("Reset to the default layout (all columns, default order).");
    } catch (error) {
      setMessage(`Reset failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="recordFormatPage" style={{ padding: 20, maxWidth: 680 }}>
      <h2 style={{ margin: "0 0 4px" }}>Record Format</h2>
      <p style={{ color: "#64748b", marginTop: 0 }}>
        Choose which columns appear on your Records page and in what order. This
        applies only to your own view (and your Excel/CSV export). Unchecked
        columns are hidden. The Change / Ops / Action columns always stay at the
        end.
      </p>

      {message && (
        <div className="alert" style={{ margin: "8px 0" }}>
          {message}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
        <button type="button" className="primaryButton" onClick={handleSave} disabled={busy}>
          Save layout
        </button>
        <button type="button" className="secondaryButton" onClick={handleReset} disabled={busy}>
          Reset to default
        </button>
        <span style={{ color: "#64748b", fontSize: 13 }}>
          {visibleColumns.length} of {items.length} columns shown
        </span>
      </div>

      <ol style={{ listStyle: "none", padding: 0, margin: 0, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        {items.map((it, i) => (
          <li
            key={it.column}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 12px",
              borderBottom: i < items.length - 1 ? "1px solid #f1f5f9" : undefined,
              background: it.visible ? "#ffffff" : "#f8fafc",
              opacity: it.visible ? 1 : 0.6,
            }}
          >
            <span style={{ width: 22, textAlign: "right", color: "#94a3b8", fontSize: 12 }}>{i + 1}</span>
            <input
              type="checkbox"
              checked={it.visible}
              onChange={() => toggle(i)}
              aria-label={`Show ${it.column}`}
            />
            <span style={{ flex: 1, fontWeight: 600 }}>{LABEL_OVERRIDE[it.column] ?? it.column}</span>
            <button type="button" className="secondaryButton" onClick={() => move(i, -1)} disabled={i === 0} title="Move up" style={{ padding: "2px 8px" }}>
              ↑
            </button>
            <button type="button" className="secondaryButton" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down" style={{ padding: "2px 8px" }}>
              ↓
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
