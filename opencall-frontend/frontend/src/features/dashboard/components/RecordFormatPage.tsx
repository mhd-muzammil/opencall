import { useState } from "react";
import { saveRecordLayout, resetRecordLayout } from "../../../lib/recordLayoutApiClient";

// Display label overrides (the stored key stays the report column key).
const LABEL_OVERRIDE: Record<string, string> = {
  "RTPL status": "Morning status",
};
const label = (column: string) => LABEL_OVERRIDE[column] ?? column;

interface ColumnItem {
  column: string;
  visible: boolean;
}

function buildInitial(orderedColumns: string[] | null, catalog: readonly string[]): ColumnItem[] {
  if (!orderedColumns || orderedColumns.length === 0) {
    return catalog.map((column) => ({ column, visible: true }));
  }
  const inLayout = orderedColumns.filter((c) => catalog.includes(c));
  const rest = catalog.filter((c) => !inLayout.includes(c));
  return [
    ...inLayout.map((column) => ({ column, visible: true })),
    ...rest.map((column) => ({ column, visible: false })),
  ];
}

export function RecordFormatPage({
  token,
  initialColumns,
  catalog,
  extraColumns = [],
  onSaved,
}: Readonly<{
  token: string;
  initialColumns: string[] | null;
  /** Full selectable column set (standard report columns + raw Excel headers). */
  catalog: string[];
  /** Raw Excel headers (a subset of catalog) — tagged as "Excel field". */
  extraColumns?: string[];
  onSaved: (orderedColumns: string[] | null) => void;
}>) {
  const extraSet = new Set(extraColumns);
  const [items, setItems] = useState<ColumnItem[]>(() => buildInitial(initialColumns, catalog));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

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
      setMessage({ text: "Keep at least one column visible.", tone: "error" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveRecordLayout(token, visibleColumns);
      onSaved(visibleColumns);
      setMessage({ text: "Saved — your Records page now uses this layout.", tone: "ok" });
    } catch (error) {
      setMessage({ text: `Save failed: ${(error as Error).message}`, tone: "error" });
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
      setItems(buildInitial(null, catalog));
      setMessage({ text: "Reset to the default layout (all columns, default order).", tone: "ok" });
    } catch (error) {
      setMessage({ text: `Reset failed: ${(error as Error).message}`, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="adminPage rfPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Record Format</h2>
        </div>
        <div className="adminPageActions">
          <button type="button" className="btnSecondary" onClick={handleReset} disabled={busy}>
            Reset to default
          </button>
          <button type="button" className="btnPrimary" onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save layout"}
          </button>
        </div>
      </div>

      <p className="muted rfIntro">
        Choose which columns appear on your Records page and in what order — this applies
        only to your own view and your Excel/CSV export. Toggle a column off to hide it, and
        use the arrows to reorder. The Change / Ops / Action columns always stay at the end.
      </p>

      {message && <div className={`rfBanner ${message.tone}`}>{message.text}</div>}

      <div className="rfPreview">
        <span className="rfPreviewLabel">Preview order</span>
        <div className="rfPreviewChips">
          {visibleColumns.length === 0 ? (
            <span className="muted">No columns selected</span>
          ) : (
            visibleColumns.map((c) => (
              <span key={c} className="rfChip">
                {label(c)}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="rfListBar">
        <span className="rfListTitle">Columns</span>
        <span className="rfCount">
          {visibleColumns.length} of {items.length} shown
        </span>
      </div>

      <ul className="rfList">
        {items.map((it, i) => (
          <li key={it.column} className={`rfRow ${it.visible ? "" : "isHidden"}`}>
            <span className="rfIndex">{i + 1}</span>

            <label className="rfSwitch" title={it.visible ? "Shown — click to hide" : "Hidden — click to show"}>
              <input
                type="checkbox"
                checked={it.visible}
                onChange={() => toggle(i)}
                aria-label={`Show ${it.column}`}
              />
              <span className="rfSwitchTrack" aria-hidden="true">
                <span className="rfSwitchThumb" />
              </span>
            </label>

            <span className="rfName">{label(it.column)}</span>
            {extraSet.has(it.column) && <span className="rfTag">Excel field</span>}
            <span className={`rfState ${it.visible ? "on" : "off"}`}>
              {it.visible ? "Shown" : "Hidden"}
            </span>

            <div className="rfMove">
              <button
                type="button"
                className="rfMoveBtn"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${it.column} up`}
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                className="rfMoveBtn"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                aria-label={`Move ${it.column} down`}
                title="Move down"
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
