// Presentational badge components extracted from app/page.tsx (Phase 4).
// Props-only, JSX preserved verbatim — no behavior changes.
import type { GeneratedReportResponse } from "../../../lib/apiClient";
import { CHANGE_TYPE_LABELS, CHANGE_FIELD_LABELS } from "../constants";
import {
  classifyFlexClosureOutcome,
  formatComparisonValue,
  formatFieldList,
  hasFlexClosureOutcome,
} from "../utils";

export function ChangeTypeBadge({
  comparison,
}: Readonly<{
  comparison: GeneratedReportResponse["rows"][number]["comparison"];
}>) {
  const changeType = comparison?.changeType;

  if (!changeType) {
    return <span className="changeBadge none">Not compared</span>;
  }

  const entries = Object.entries(comparison.changedFields);

  return (
    <span className="changeTooltipWrap" tabIndex={0}>
      <span className={`changeBadge ${changeType.toLowerCase()}`}>
        {CHANGE_TYPE_LABELS[changeType]}
      </span>
      <span className="changeTooltip" role="tooltip">
        <strong>{comparison.changeSummary ?? CHANGE_TYPE_LABELS[changeType]}</strong>
        {entries.length > 0 ? (
          <span className="changeTooltipList">
            {entries.map(([field, change]) => (
              <span key={field}>
                <b>{CHANGE_FIELD_LABELS[field] ?? field}</b>
                <span>
                  {formatComparisonValue(change.from)} → {formatComparisonValue(change.to)}
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="changeTooltipMuted">
            {changeType === "NEW"
              ? "No previous row"
              : changeType === "CLOSED"
                ? "Not present in current report table"
                : "No field changes"}
          </span>
        )}
        {comparison.previousFlexStatus || comparison.previousRtplStatus || comparison.previousWipAging ? (
          <span className="changeTooltipPrevious">
            Prev Flex: {formatComparisonValue(comparison.previousFlexStatus)}
            {" · "}
            Prev RTPL: {formatComparisonValue(comparison.previousRtplStatus)}
            {" · "}
            Prev WIP: {formatComparisonValue(comparison.previousWipAging)}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function CarryForwardBadge({
  carryForward,
  output,
}: Readonly<{
  carryForward: GeneratedReportResponse["rows"][number]["carryForward"];
  /**
   * The row's outgoing values, so a closed work order can show HOW it closed.
   * Optional: callers without it fall back to the flat "Closed" badge.
   */
  output?: Record<string, unknown> | undefined;
}>) {
  if (carryForward.closedSyntheticRow) {
    // Flex distinguishes a completed job from an abandoned one, and only the
    // former is billable — so a cancellation says so instead of hiding behind
    // the same "Closed" badge as real work.
    const cancelled =
      output !== undefined &&
      hasFlexClosureOutcome(output) &&
      classifyFlexClosureOutcome(output["Flex Status"]) === "cancelled";

    if (cancelled) {
      return (
        <span
          className="opsBadge cancelled"
          title="Flex closed this work order as Closed - Canceled — abandoned, not billable"
        >
          Cancellation
        </span>
      );
    }

    return (
      <span
        className="opsBadge closed"
        title="Closed work order carried from the previous final report"
      >
        Closed
      </span>
    );
  }

  if (carryForward.carriedForwardFields.length > 0) {
    return (
      <span
        className="opsBadge carried"
        title={`Value carried from previous day: ${formatFieldList(carryForward.carriedForwardFields)}`}
      >
        Carried
      </span>
    );
  }

  if (carryForward.changeType === "NEW_WORK_ORDER") {
    return (
      <span
        className="opsBadge new"
        title="New work order; manual fields must be completed today"
      >
        New WO
      </span>
    );
  }

  if (carryForward.manualFieldsMissing.length > 0) {
    return (
      <span
        className="opsBadge manual"
        title={`Manual entry required: ${formatFieldList(carryForward.manualFieldsMissing)}`}
      >
        Manual
      </span>
    );
  }

  return (
    <span className="opsBadge complete" title="Manual fields are complete">
      Complete
    </span>
  );
}
