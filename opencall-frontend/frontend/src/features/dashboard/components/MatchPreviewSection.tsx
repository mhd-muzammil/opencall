// Match Preview section extracted from app/page.tsx (Phase 6.3).
// JSX preserved verbatim; props passed explicitly (no logic/state/handler changes).
// The `preview && showMatchPreviewSection` render guard stays in page.tsx, so
// `preview` is always non-null here.
import type { Dispatch, SetStateAction } from "react";
import type { MatchPreviewResponse } from "../../../lib/apiClient";
import { Metric } from "./MetricCards";

export function MatchPreviewSection({
  preview,
  isBusy,
  canUseBatches,
  handleGenerate,
  selectedPreviewCategory,
  setSelectedPreviewCategory,
  selectedRecords,
}: Readonly<{
  preview: MatchPreviewResponse;
  isBusy: boolean;
  canUseBatches: boolean;
  handleGenerate: () => Promise<void>;
  selectedPreviewCategory: string | null;
  setSelectedPreviewCategory: Dispatch<SetStateAction<string | null>>;
  selectedRecords: MatchPreviewResponse["enrichedRows"] | null;
}>) {
  return (
    <section className="panel">
      <div className="sectionHeader">
        <h2>Match Preview</h2>
        <button type="button" disabled={isBusy || !canUseBatches} onClick={() => void handleGenerate()}>
          Generate Report
        </button>
      </div>
      <div className="metricGrid">
        <Metric
          label="Flex WIP rows"
          value={preview.totalFlexRows ?? 0}
          onClick={() =>
            setSelectedPreviewCategory(
              selectedPreviewCategory === "Renderways" ? null : "Renderways"
            )
          }
          isActive={selectedPreviewCategory === "Renderways"}
        />
        <Metric
          label="Flex matched"
          value={preview.flexMatchedRows}
          onClick={() =>
            setSelectedPreviewCategory(
              selectedPreviewCategory === "Flex matched" ? null : "Flex matched"
            )
          }
          isActive={selectedPreviewCategory === "Flex matched"}
        />
        <Metric
          label="Call Plan matched"
          value={preview.callPlanMatchedRows}
          onClick={() =>
            setSelectedPreviewCategory(
              selectedPreviewCategory === "Call Plan matched" ? null : "Call Plan matched"
            )
          }
          isActive={selectedPreviewCategory === "Call Plan matched"}
        />
        <Metric
          label="Flex missing"
          value={preview.unmatchedFlexRows}
          onClick={() =>
            setSelectedPreviewCategory(
              selectedPreviewCategory === "Flex missing" ? null : "Flex missing"
            )
          }
          isActive={selectedPreviewCategory === "Flex missing"}
        />
        <Metric
          label="Call Plan missing"
          value={preview.unmatchedCallPlanRows}
          onClick={() =>
            setSelectedPreviewCategory(
              selectedPreviewCategory === "Call Plan missing" ? null : "Call Plan missing"
            )
          }
          isActive={selectedPreviewCategory === "Call Plan missing"}
        />
      </div>
      {selectedPreviewCategory && selectedRecords && selectedRecords.length > 0 && (
        <div style={{ marginTop: "16px", minWidth: 0 }}>
          <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>
            {selectedPreviewCategory} Records
          </h3>
          <div className="tableWrap" style={{ maxHeight: "400px" }}>
            <table>
              <thead>
                <tr>
                  {Object.keys(selectedRecords[0] ?? {}).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedRecords.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val, j) => (
                      <td key={j}>{String(val ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
