"use client";

// Row virtualization for a fixed-layout table: renders only the rows in (and
// around) the viewport, with two spacer rows preserving the exact scrollbar
// geometry. Owns its scroll subscription and window state, so scrolling
// re-renders THIS tbody only — never the (large) parent component. With
// hysteresis, casual scrolling inside the overscan buffer costs zero renders;
// a window shift re-renders ~(viewport + 2×overscan) rows.
//
// Requirements: uniform row height (rowPx) — true for the records grid
// (table-layout: fixed + nowrap cells) — and a scrollable ancestor passed by
// ref. Row content/behavior stays fully in the parent via renderRow.
import {
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export interface VirtualTbodyProps<T> {
  rows: readonly T[];
  /** Uniform row height in px (spacer geometry). */
  rowPx: number;
  /** Rows rendered beyond each viewport edge. */
  overscan?: number;
  /** Re-render only when the viewport gets this close (rows) to a window edge. */
  guard?: number;
  /** The scrollable wrapper around the table. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Re-attach the scroll listener when this changes (e.g. full-screen moves the element). */
  attachKey?: unknown;
  /** colSpan for the spacer cells (total table columns). */
  colSpan: number;
  renderRow: (row: T, visibleIndex: number) => ReactNode;
}

export function VirtualTbody<T>({
  rows,
  rowPx,
  overscan = 30,
  guard = 10,
  scrollRef,
  attachKey,
  colSpan,
  renderRow,
}: VirtualTbodyProps<T>) {
  const [window, setWindow] = useState({ start: 0, end: 120 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const update = () => {
      const visibleFirst = Math.floor(el.scrollTop / rowPx);
      const visibleLast = Math.ceil((el.scrollTop + el.clientHeight) / rowPx);
      setWindow((current) => {
        const nearTop =
          current.start > 0 && visibleFirst - current.start < guard;
        const nearBottom =
          current.end < rows.length && current.end - visibleLast < guard;
        const outside =
          visibleFirst < current.start || visibleLast > current.end;
        if (!nearTop && !nearBottom && !outside) {
          return current;
        }
        return {
          start: Math.max(0, visibleFirst - overscan),
          end: visibleLast + overscan,
        };
      });
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [scrollRef, attachKey, rows.length, rowPx, overscan, guard]);

  const start = Math.min(window.start, Math.max(0, rows.length - 1));
  const end = Math.min(Math.max(window.end, start + 1), rows.length);
  const bottomRows = rows.length - end;

  return (
    <tbody>
      {start > 0 && (
        <tr aria-hidden="true" style={{ height: start * rowPx }}>
          <td colSpan={colSpan} style={{ padding: 0, border: 0 }} />
        </tr>
      )}
      {rows.slice(start, end).map((row, index) => renderRow(row, start + index))}
      {bottomRows > 0 && (
        <tr aria-hidden="true" style={{ height: bottomRows * rowPx }}>
          <td colSpan={colSpan} style={{ padding: 0, border: 0 }} />
        </tr>
      )}
    </tbody>
  );
}
