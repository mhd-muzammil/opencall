"use client";

import { useState } from "react";
import { FileSpreadsheet, MapPin, Route } from "lucide-react";
import LiveTrackingPanel from "./LiveTrackingPanel";
import KmReportPanel from "./KmReportPanel";
import DayReportPanel from "./DayReportPanel";

/**
 * The Live Tracking section of the main app: the live board, and the KM Report
 * beside it as a second tab -- the office asked for the kilometres INSIDE Live
 * Tracking, not as a page of their own -- and the Day Report as a third.
 *
 * Only the open tab is mounted. The board polls Payroll every 30 seconds and
 * the reports ask it once per day of a period; none of them has any business
 * running while another is on screen.
 */

type Tab = "board" | "km" | "day";

const TABS: { key: Tab; label: string; Icon: typeof MapPin }[] = [
  { key: "board", label: "Live Tracking", Icon: MapPin },
  { key: "km", label: "KM Report", Icon: Route },
  { key: "day", label: "Day Report", Icon: FileSpreadsheet },
];

export default function LiveTrackingSection({ token }: { token: string | null }) {
  const [tab, setTab] = useState<Tab>("board");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Live Tracking"
        style={{ display: "flex", gap: 4, borderBottom: "1px solid #e5e7eb", marginBottom: 16 }}
      >
        {TABS.map(({ key, label, Icon }) => {
          const open = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={open}
              onClick={() => setTab(key)}
              style={{
                // First, so the weight and size below are not reset by it.
                font: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                marginBottom: -1,
                border: "none",
                borderBottom: `2px solid ${open ? "#4f46e5" : "transparent"}`,
                background: "none",
                color: open ? "#4f46e5" : "#6b7280",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              <Icon size={16} strokeWidth={2} /> {label}
            </button>
          );
        })}
      </div>
      {tab === "board" ? (
        <LiveTrackingPanel token={token} embedded />
      ) : tab === "km" ? (
        <KmReportPanel token={token} embedded />
      ) : (
        <DayReportPanel token={token} />
      )}
    </div>
  );
}
