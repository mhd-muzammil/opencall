// Presentational summary-panel components extracted from app/page.tsx (Phase 4).
// Props-only, JSX preserved verbatim — no behavior changes.
import type { GeneratedReportResponse } from "../../../lib/apiClient";
import { StatusPill } from "../../../components/StatusPill";
import { Metric } from "./MetricCards";

export function CarryForwardSummaryPanel({
  report,
}: Readonly<{
  report: GeneratedReportResponse;
}>) {
  return (
    <div className="carryForwardPanel">
      <div className="comparisonPanelHeader">
        <div>
          <h3>Manual Field Carry-Forward</h3>
          <p>Uses the previous final human-edited report for this region.</p>
        </div>
        <StatusPill tone={report.carryForward.totalFieldsCarried > 0 ? "good" : "neutral"}>
          {report.carryForward.totalFieldsCarried > 0 ? "Applied" : "No carried fields"}
        </StatusPill>
      </div>
      <div className="comparisonMetricGrid">
        <Metric label="Fields Carried" value={report.carryForward.totalFieldsCarried} />
        <Metric label="Rows Auto Completed" value={report.carryForward.rowsAutoCompleted} />
        <Metric label="Rows Still Manual" value={report.carryForward.rowsStillManual} />
        <Metric
          label="Closed Rows"
          value={report.rows.filter((row) => row.carryForward.closedSyntheticRow).length}
        />
      </div>
    </div>
  );
}

export function ComparisonSummaryPanel({
  report,
}: Readonly<{
  report: GeneratedReportResponse;
}>) {
  if (report.comparison.skipped || !report.comparison.summary) {
    return (
      <div className="comparisonPanel skipped">
        <div>
          <h3>Day-over-Day Comparison</h3>
          <p>No previous-day final report was available for this region.</p>
        </div>
        <StatusPill tone="neutral">Skipped</StatusPill>
      </div>
    );
  }

  const summary = report.comparison.summary;

  return (
    <div className="comparisonPanel">
      <div className="comparisonPanelHeader">
        <div>
          <h3>Day-over-Day Comparison</h3>
          <p>Compared with session {report.comparison.previousSessionId}</p>
        </div>
        <StatusPill tone="good">Compared</StatusPill>
      </div>
      <div className="comparisonMetricGrid">
        <Metric label="New" value={summary.new_count} />
        <Metric label="Closed" value={summary.closed_count} />
        <Metric label="Updated" value={summary.updated_count} />
        <Metric label="Carried" value={summary.carried_count} />
      </div>
    </div>
  );
}
