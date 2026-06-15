// Overview layout-control toggles extracted from app/page.tsx (Phase 6.1).
// JSX preserved verbatim; props are the existing boolean values and their setters.
import type { Dispatch, SetStateAction } from "react";

export function DashboardToggles({
  showDayOverDayComparison,
  setShowDayOverDayComparison,
  showMatchPreviewSection,
  setShowMatchPreviewSection,
  showManualCarryForward,
  setShowManualCarryForward,
  showCaseTypeOverview,
  setShowCaseTypeOverview,
  showCustomerSegmentSplit,
  setShowCustomerSegmentSplit,
  showClosedCallLedger,
  setShowClosedCallLedger,
  showUploadBatches,
  setShowUploadBatches,
}: Readonly<{
  showDayOverDayComparison: boolean;
  setShowDayOverDayComparison: Dispatch<SetStateAction<boolean>>;
  showMatchPreviewSection: boolean;
  setShowMatchPreviewSection: Dispatch<SetStateAction<boolean>>;
  showManualCarryForward: boolean;
  setShowManualCarryForward: Dispatch<SetStateAction<boolean>>;
  showCaseTypeOverview: boolean;
  setShowCaseTypeOverview: Dispatch<SetStateAction<boolean>>;
  showCustomerSegmentSplit: boolean;
  setShowCustomerSegmentSplit: Dispatch<SetStateAction<boolean>>;
  showClosedCallLedger: boolean;
  setShowClosedCallLedger: Dispatch<SetStateAction<boolean>>;
  showUploadBatches: boolean;
  setShowUploadBatches: Dispatch<SetStateAction<boolean>>;
}>) {
  return (
    <div className="viewControlsPanel" style={{
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "20px",
      padding: "12px 18px",
      background: "rgba(255, 255, 255, 0.85)",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(15, 23, 42, 0.03)",
      backdropFilter: "blur(8px)",
      width: "fit-content",
      marginTop: "24px",
      justifySelf: "center"
    }}>
      <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Layout Controls
      </span>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
        <input
          type="checkbox"
          checked={showDayOverDayComparison}
          onChange={(e) => setShowDayOverDayComparison(e.target.checked)}
          style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--accent)", margin: 0 }}
        />
        Show Day-over-Day Comparison
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
        <input
          type="checkbox"
          checked={showMatchPreviewSection}
          onChange={(e) => setShowMatchPreviewSection(e.target.checked)}
          style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--accent)", margin: 0 }}
        />
        Show Match Preview
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
        <input
          type="checkbox"
          checked={showManualCarryForward}
          onChange={(e) => setShowManualCarryForward(e.target.checked)}
          style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--accent)", margin: 0 }}
        />
        Show Manual Field Carry-Forward
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
        <input
          type="checkbox"
          checked={showCaseTypeOverview}
          onChange={(e) => setShowCaseTypeOverview(e.target.checked)}
          style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--accent)", margin: 0 }}
        />
        Show Case Type Overview
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
        <input
          type="checkbox"
          checked={showCustomerSegmentSplit}
          onChange={(e) => setShowCustomerSegmentSplit(e.target.checked)}
          style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--accent)", margin: 0 }}
        />
        Show Customer Segment Split
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
        <input
          type="checkbox"
          checked={showClosedCallLedger}
          onChange={(e) => setShowClosedCallLedger(e.target.checked)}
          style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--accent)", margin: 0 }}
        />
        Show Closed Call Ledger
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--text)", userSelect: "none" }}>
        <input
          type="checkbox"
          checked={showUploadBatches}
          onChange={(e) => setShowUploadBatches(e.target.checked)}
          style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "var(--accent)", margin: 0 }}
        />
        Show Upload Batches
      </label>
    </div>
  );
}
