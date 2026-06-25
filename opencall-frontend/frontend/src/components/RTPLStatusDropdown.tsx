"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RTPL_STATUS_GROUPS } from "@opencall/shared";
import type { DropdownRtplStatus } from "../lib/api/types";

export interface StatusGroup {
  group: string;
  options: readonly string[];
}

interface RTPLStatusDropdownProps {
  value: string;
  onChange: (value: string) => void;
  manualEntryRequiredLabel: string;
  /**
   * Dynamic, admin-managed status groups fetched from the API. When omitted the
   * component falls back to the legacy hardcoded groups so it keeps working if a
   * caller hasn't been wired up yet.
   */
  groups?: readonly StatusGroup[];
}

/**
 * Convert the flat, ordered dropdown list returned by the API into the grouped
 * shape the dropdown renders. Insertion order is preserved (the API already
 * sorts by sort_order), so categories appear in their seeded display order.
 */
export function buildStatusGroups(statuses: readonly DropdownRtplStatus[]): StatusGroup[] {
  const byCategory = new Map<string, string[]>();
  for (const status of statuses) {
    const category = status.category || "Other";
    const existing = byCategory.get(category);
    if (existing) {
      existing.push(status.name);
    } else {
      byCategory.set(category, [status.name]);
    }
  }
  return Array.from(byCategory.entries()).map(([group, options]) => ({ group, options }));
}

export function splitStatusGroupsForColumns(groups: readonly StatusGroup[]): [StatusGroup[], StatusGroup[]] {
  const columns: [StatusGroup[], StatusGroup[]] = [[], []];
  const weights: [number, number] = [0, 0];

  for (const group of groups) {
    const targetColumn: 0 | 1 = weights[0] <= weights[1] ? 0 : 1;
    columns[targetColumn].push(group);
    weights[targetColumn] += group.options.length + 1;
  }

  return columns;
}

export function RTPLStatusDropdown({ value, onChange, manualEntryRequiredLabel, groups }: RTPLStatusDropdownProps) {
  const baseGroups: readonly StatusGroup[] = groups && groups.length > 0 ? groups : RTPL_STATUS_GROUPS;
  const flatOptions = baseGroups.flatMap((g) => g.options);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Position below the button
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const isCustom = value !== "" && !flatOptions.includes(value);

  // Helper to render the item button
  const renderItem = (option: string, label: string) => {
    const isSelected = value === option || (option === "Custom" && isCustom);
    return (
      <button
        key={option}
        type="button"
        onClick={() => {
          onChange(option);
          setIsOpen(false);
        }}
        style={{
          textAlign: "left",
          padding: "5px 8px",
          borderRadius: "4px",
          border: "none",
          backgroundColor: isSelected ? "#e0e7ff" : "transparent",
          color: isSelected ? "#3730a3" : "#333",
          cursor: "pointer",
          fontSize: "13px",
          lineHeight: 1.25,
          transition: "background 0.1s",
          width: "100%",
          minHeight: "27px"
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = "#f3f4f6";
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        {label}
      </button>
    );
  };

  const getDisplayValue = () => {
    if (!value) return manualEntryRequiredLabel;
    if (isCustom) return "Custom";
    return value;
  };

  // Append the manual-entry "Custom" item, merging into an existing "Other"
  // category if the admin happens to have created one (avoids duplicate keys).
  const hasOther = baseGroups.some((g) => g.group === "Other");
  const statusGroups: StatusGroup[] = hasOther
    ? baseGroups.map((g) =>
        g.group === "Other" ? { group: g.group, options: [...g.options, "Custom"] } : g,
      )
    : [...baseGroups, { group: "Other", options: ["Custom"] }];
  const [leftColumnGroups, rightColumnGroups] = splitStatusGroupsForColumns(statusGroups);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cellInput"
        style={{
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          cursor: "pointer",
          backgroundColor: "#fff",
          color: "var(--text)",
          border: "1px solid #ddd",
          padding: "4px 8px",
          borderRadius: "4px",
          minHeight: "28px"
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {getDisplayValue()}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "absolute",
              top: coords.top + 4,
              left: coords.left,
              backgroundColor: "#fff",
              border: "1px solid #ddd",
              boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
              borderRadius: "8px",
              padding: "12px",
              zIndex: 99999,
              width: "min(560px, calc(100vw - 24px))",
              maxHeight: "min(620px, calc(100vh - 24px))",
              overflowY: "auto"
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {leftColumnGroups.map((group) => (
                  <div key={group.group}>
                    <div style={{ fontWeight: 600, fontSize: "11px", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {group.group}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {group.options.map((option) => renderItem(option, option === "Custom" ? "Custom Manual Entry..." : option))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {rightColumnGroups.map((group) => (
                  <div key={group.group}>
                    <div style={{ fontWeight: 600, fontSize: "11px", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {group.group}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {group.options.map((option) => renderItem(option, option === "Custom" ? "Custom Manual Entry..." : option))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
