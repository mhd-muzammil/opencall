"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RTPL_STATUS_GROUPS, RTPL_STATUS_OPTIONS } from "@opencall/shared";

interface RTPLStatusDropdownProps {
  value: string;
  onChange: (value: string) => void;
  manualEntryRequiredLabel: string;
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
          padding: "6px 8px",
          borderRadius: "4px",
          border: "none",
          backgroundColor: isSelected ? "#e0e7ff" : "transparent",
          color: isSelected ? "#3730a3" : "#333",
          cursor: "pointer",
          fontSize: "13px",
          transition: "background 0.1s",
          width: "100%"
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

  // Split groups into roughly two columns
  const leftColumnGroups = RTPL_STATUS_GROUPS.slice(0, 5);
  const rightColumnGroups = RTPL_STATUS_GROUPS.slice(5);

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
              padding: "16px",
              zIndex: 99999,
              width: "max-content",
              maxWidth: "600px",
              maxHeight: "80vh",
              overflowY: "auto"
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {leftColumnGroups.map((group) => (
                  <div key={group.group}>
                    <div style={{ fontWeight: 600, fontSize: "11px", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {group.group}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {group.options.map((option) => renderItem(option, option))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {rightColumnGroups.map((group) => (
                  <div key={group.group}>
                    <div style={{ fontWeight: 600, fontSize: "11px", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {group.group}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {group.options.map((option) => renderItem(option, option))}
                    </div>
                  </div>
                ))}

                <div>
                   <div style={{ fontWeight: 600, fontSize: "11px", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Other
                   </div>
                   <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {renderItem("Custom", "Custom Manual Entry...")}
                   </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
