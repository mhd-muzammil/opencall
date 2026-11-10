"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

/**
 * The Reports section's employee picker.
 *
 *   - Everyone by default; one click on a person picks just them, later clicks
 *     add or remove people.
 *   - Quick picks: Everyone, Field engineers, Office staff.
 *   - People grouped by branch, and a branch's box picks the whole branch.
 *   - Search by name or branch.
 *   - Who is picked shows as chips under the box, each removable, and the ×
 *     on the box goes back to everyone.
 */

export interface PickerPerson {
  id: number;
  name: string;
  branch: string;
  /** A field engineer; otherwise office staff. */
  engineer: boolean;
}

export interface EmployeePickerProps {
  id?: string;
  people: PickerPerson[];
  /** null = everybody. */
  selected: ReadonlySet<number> | null;
  onChange: (next: Set<number> | null) => void;
  disabled?: boolean;
}

const C = {
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  soft: "#f1f5f9",
  brand: "#4f46e5",
  brandDark: "#4338ca",
  brandTint: "#eef2ff",
};

const reset: CSSProperties = { font: "inherit", minHeight: 0, height: "auto", boxShadow: "none", margin: 0 };

const box: CSSProperties = {
  ...reset,
  height: 40,
  padding: "0 10px 0 12px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: C.ink,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  textAlign: "left",
};

const NO_BRANCH = "No branch";

function Tick({ state }: { state: "on" | "off" | "some" }) {
  const on = state === "on";
  return (
    <span
      aria-hidden
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        flex: "none",
        display: "grid",
        placeItems: "center",
        border: `1.5px solid ${state === "off" ? C.faint : C.brand}`,
        background: on ? C.brand : "#fff",
      }}
    >
      {on ? <Check size={12} strokeWidth={3} color="#fff" /> : state === "some" ? <span style={{ width: 8, height: 2, background: C.brand }} /> : null}
    </span>
  );
}

export default function EmployeePicker({ id, people, selected, onChange, disabled = false }: EmployeePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    search.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isAll = selected == null;
  const isOn = (personId: number) => isAll || selected.has(personId);
  const engineers = useMemo(() => people.filter((p) => p.engineer).map((p) => p.id), [people]);
  const staff = useMemo(() => people.filter((p) => !p.engineer).map((p) => p.id), [people]);

  /** Settle a set: everybody or nobody is "everyone", never an empty report. */
  const commit = (next: Set<number>) => onChange(next.size === 0 || next.size === people.length ? null : next);

  const same = (ids: number[]) => !isAll && selected.size === ids.length && ids.every((i) => selected.has(i));
  const quickPick = (ids: number[] | null) => (ids == null ? onChange(null) : commit(new Set(ids)));

  const togglePerson = (personId: number) => {
    // From "everyone", a click picks that one person.
    if (isAll) return commit(new Set([personId]));
    const next = new Set(selected);
    if (next.has(personId)) next.delete(personId);
    else next.add(personId);
    commit(next);
  };

  const toggleGroup = (ids: number[]) => {
    if (isAll) return commit(new Set(ids));
    const next = new Set(selected);
    const allIn = ids.every((i) => next.has(i));
    for (const i of ids) {
      if (allIn) next.delete(i);
      else next.add(i);
    }
    commit(next);
  };

  // Matching people, by branch, branches A-Z and people A-Z inside each.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = q ? people.filter((p) => p.name.toLowerCase().includes(q) || p.branch.toLowerCase().includes(q)) : people;
    const byBranch = new Map<string, PickerPerson[]>();
    for (const p of match) {
      const key = p.branch || NO_BRANCH;
      byBranch.set(key, [...(byBranch.get(key) ?? []), p]);
    }
    return [...byBranch.entries()]
      .sort(([a], [b]) => (a === NO_BRANCH ? 1 : b === NO_BRANCH ? -1 : a.localeCompare(b)))
      .map(([branch, list]) => ({ branch, list: list.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [people, query]);

  const picked = isAll ? [] : people.filter((p) => selected.has(p.id));
  const label = isAll
    ? `Everyone (${people.length})`
    : same(engineers)
      ? `Field engineers (${engineers.length})`
      : same(staff)
        ? `Office staff (${staff.length})`
        : picked.length === 1
          ? picked[0]!.name
          : `${picked.length} employees`;

  const chip = (active: boolean): CSSProperties => ({
    ...reset,
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 10px",
    borderRadius: 999,
    border: `1px solid ${active ? C.brand : C.line}`,
    background: active ? C.brandTint : "#fff",
    color: active ? C.brandDark : C.body,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div ref={root} style={{ position: "relative" }}>
      <button
        id={id}
        type="button"
        style={{ ...box, opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isAll ? 400 : 600 }}>
          {disabled ? "Loading employees…" : label}
        </span>
        {!isAll ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Back to everyone"
            title="Back to everyone"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChange(null);
              }
            }}
            style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 6, background: C.brandTint, color: C.brandDark }}
          >
            <X size={14} />
          </span>
        ) : null}
        <ChevronDown size={16} color={C.muted} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {/* Who is picked, each removable -- only when it is a short list of names. */}
      {!isAll && !open && picked.length >= 2 && picked.length <= 8 && !same(engineers) && !same(staff) ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {picked.map((p) => (
            <span
              key={p.id}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, padding: "3px 4px 3px 10px", borderRadius: 999, background: C.brandTint, color: C.brandDark }}
            >
              {p.name}
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                onClick={() => togglePerson(p.id)}
                style={{ ...reset, width: 18, height: 18, borderRadius: 999, border: "none", background: "transparent", color: C.brandDark, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          role="listbox"
          aria-multiselectable
          style={{
            position: "absolute",
            zIndex: 30,
            top: 46,
            left: 0,
            width: "max(100%, 390px)",
            maxWidth: "calc(100vw - 32px)",
            background: "#fff",
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.16)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 10, borderBottom: `1px solid ${C.soft}`, display: "grid", gap: 10 }}>
            <div style={{ position: "relative" }}>
              <Search size={15} color={C.faint} style={{ position: "absolute", left: 10, top: 10 }} />
              <input
                ref={search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or branch"
                aria-label="Search employees"
                style={{ ...box, cursor: "text", height: 36, paddingLeft: 32 }}
              />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" style={chip(isAll)} onClick={() => quickPick(null)}>
                Everyone · {people.length}
              </button>
              {engineers.length > 0 ? (
                <button type="button" style={chip(same(engineers))} onClick={() => quickPick(engineers)}>
                  Field engineers · {engineers.length}
                </button>
              ) : null}
              {staff.length > 0 ? (
                <button type="button" style={chip(same(staff))} onClick={() => quickPick(staff)}>
                  Office staff · {staff.length}
                </button>
              ) : null}
            </div>
          </div>

          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {groups.length === 0 ? (
              <div style={{ padding: "18px 12px", fontSize: 13, color: C.muted, textAlign: "center" }}>No one matches “{query}”.</div>
            ) : (
              groups.map(({ branch, list }) => {
                const ids = list.map((p) => p.id);
                const on = ids.filter(isOn).length;
                return (
                  <div key={branch}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(ids)}
                      style={{
                        ...reset,
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        background: "#f8fafc",
                        border: "none",
                        borderTop: `1px solid ${C.soft}`,
                        borderBottom: `1px solid ${C.soft}`,
                        borderRadius: 0,
                        cursor: "pointer",
                        textAlign: "left",
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                      }}
                      title={`Select everyone in ${branch}`}
                    >
                      <Tick state={on === ids.length ? "on" : on > 0 ? "some" : "off"} />
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{branch}</span>
                      <span style={{ fontSize: 12, color: C.faint }}>{list.length}</span>
                    </button>
                    {list.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={!isAll && selected.has(p.id)}
                        onClick={() => togglePerson(p.id)}
                        style={{
                          ...reset,
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px 8px 22px",
                          background: !isAll && selected.has(p.id) ? "#fafaff" : "#fff",
                          border: "none",
                          borderRadius: 0,
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: 14,
                          color: C.ink,
                        }}
                      >
                        <Tick state={isOn(p.id) ? "on" : "off"} />
                        <span style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{p.name}</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: p.engineer ? "#ecfdf5" : C.soft,
                            color: p.engineer ? "#047857" : C.muted,
                          }}
                        >
                          {p.engineer ? "Engineer" : "Staff"}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderTop: `1px solid ${C.soft}`, background: "#f8fafc" }}>
            <span style={{ fontSize: 12, color: C.muted }}>
              {isAll ? `Everyone included (${people.length})` : `${picked.length} of ${people.length} selected`}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ ...box, width: "auto", height: 32, padding: "0 16px", background: C.brand, color: "#fff", border: `1px solid ${C.brand}`, fontWeight: 600, fontSize: 13 }}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
