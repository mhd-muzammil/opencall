"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RTPL_STATUS_GROUPS, RTPL_STATUS_OPTIONS } from "@opencall/shared";

interface RTPLStatusDropdownProps {
  value: string;
  onChange: (value: string) => void;
  manualEntryRequiredLabel: string;
}

type StatusGroup = (typeof RTPL_STATUS_GROUPS)[number] | {
  group: string;
  options: readonly string[];
};

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

export function RTPLStatusDropdown({ value, onChange, manualEntryRequiredLabel }: RTPLStatusDropdownProps) {
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

  const isCustom = value !== "" && !RTPL_STATUS_OPTIONS.includes(value as any);

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

  const statusGroups = [
    ...RTPL_STATUS_GROUPS,
    { group: "Other", options: ["Custom"] },
  ] as const;
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
