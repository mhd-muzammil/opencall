// Live "Scheduled on <today>" auto-remark preview for the records edit
// surfaces (the inline row editor and EditRecordModal, both driven by
// page.tsx's shared draftOutput state).
//
// Mirrors the SERVER rule that fires on save:
//   open_call_2/backend/src/services/reportRows/reportRowEditService.ts
//   (applyReportRowManualFieldEdit -> buildScheduledRemark(istTodayIso()))
// The template itself lives in the shared package (utils/rcaText.ts), which
// exists as a byte-identical copy in BOTH repos. DRIFT RISK: if the backend
// copy's template or trigger ever changes, this preview (and
// AUTO_SCHEDULED_REMARK_PATTERN below) must change with it, or the text shown
// before save will disagree with what a server-generated save writes.
// A scheduling save sends the Current Remarks box even when unchanged (see
// saveEditing), so whatever this preview leaves in the box IS what the server
// stores — the box, not the server, decides the remark on these saves.

import {
  buildScheduledRemark,
  buildSscPendingRemark,
  isAutoSscEtaRemark,
  isScheduledStatus,
  isSscPendingStatus,
  istTodayIso,
} from "@opencall/shared";
import { MANUAL_ENTRY_REQUIRED } from "../constants";

/**
 * Byte-shape of buildScheduledRemark output, e.g. "Scheduled on 29th July".
 * Used to recognise a previously AUTO-generated remark (possibly stale, e.g.
 * yesterday's date) so the preview may refresh it — human-typed text never
 * matches and is never replaced.
 */
export const AUTO_SCHEDULED_REMARK_PATTERN =
  /^Scheduled on \d{1,2}(st|nd|rd|th) [A-Z][a-z]+$/;

export function isAutoScheduledRemark(
  value: string | number | null | undefined,
): boolean {
  return AUTO_SCHEDULED_REMARK_PATTERN.test(String(value ?? "").trim());
}

/** Trim + collapse the "Manual Entry Required" sentinel to empty. */
function clean(value: string | number | null | undefined): string {
  const text = String(value ?? "").trim();
  return text === MANUAL_ENTRY_REQUIRED ? "" : text;
}

export interface ScheduledRemarkTriggerInput {
  draftMorningStatus: string | number | null | undefined;
  draftEveningStatus: string | number | null | undefined;
  persistedMorningStatus: string | number | null | undefined;
  persistedEveningStatus: string | number | null | undefined;
  draftEngineer: string | number | null | undefined;
}

/**
 * Whether the current edit session would make the server generate the
 * "Scheduled on <today>" remark on save: THIS edit moves a status column
 * (Morning or Evening) to Scheduled — draft is Scheduled AND differs from the
 * persisted value, because the save path only PATCHes changed fields and the
 * server only fires when the patch itself sets a Scheduled status — and an
 * engineer is selected. An already-scheduled row edited without a status
 * change never regenerates server-side, so it never previews here either.
 */
export function isScheduledRemarkTriggered(
  input: ScheduledRemarkTriggerInput,
): boolean {
  const setsScheduled = (
    draft: string | number | null | undefined,
    persisted: string | number | null | undefined,
  ): boolean => {
    const draftValue = clean(draft);
    return isScheduledStatus(draftValue) && draftValue !== clean(persisted);
  };

  return (
    (setsScheduled(input.draftMorningStatus, input.persistedMorningStatus) ||
      setsScheduled(input.draftEveningStatus, input.persistedEveningStatus)) &&
    clean(input.draftEngineer) !== ""
  );
}

export interface ScheduledRemarkPreviewInput extends ScheduledRemarkTriggerInput {
  draftRemark: string | number | null | undefined;
  /**
   * The row's SAVED remark (row.output, not the draft). Separates a remark the
   * row arrived with — typically carried forward from the day it was Customer
   * Pending, which a scheduling save overwrites — from text typed during THIS
   * edit session, which the save keeps. Omit only where the saved value is not
   * available; the box is then treated as user-authored and left alone.
   */
  persistedRemark?: string | number | null | undefined;
  /** Injectable for tests; defaults to today in Asia/Kolkata (like the server). */
  todayIso?: string;
}

/**
 * The value the Current Remarks box should be prefilled with right now, or
 * null to leave the field alone.
 *
 * Prefill rules: only when the trigger holds (see isScheduledRemarkTriggered)
 * AND the remarks box is empty, the "Manual Entry Required" sentinel, still
 * byte-exactly a previously auto-generated value, or still the row's saved
 * remark untouched by this edit session. Text the user typed while editing is
 * never replaced. Returns null too when the box already shows exactly today's
 * generated line (nothing to change).
 */
export function scheduledRemarkPreviewValue(
  input: ScheduledRemarkPreviewInput,
): string | null {
  if (!isScheduledRemarkTriggered(input)) {
    return null;
  }

  const remark = clean(input.draftRemark);
  const untouchedThisSession = remark === clean(input.persistedRemark);
  if (remark !== "" && !untouchedThisSession && !isAutoScheduledRemark(remark)) {
    return null;
  }

  const generated = buildScheduledRemark(input.todayIso ?? istTodayIso());
  return remark === generated ? null : generated;
}

// ---------------------------------------------------------------- SSC Pending

/**
 * Live "ETA <case created + 2 days>" auto-remark preview, the SSC-Pending
 * sibling of the scheduling rule above.
 *
 * Mirrors the SERVER rule that fires on save:
 *   open_call_2/backend/src/services/reportRows/reportRowEditService.ts
 *   (applyReportRowManualFieldEdit -> buildSscPendingRemark)
 * Same DRIFT RISK applies: the trigger and the template must stay identical on
 * both sides or the box will disagree with what the save writes.
 */
export interface SscEtaRemarkTriggerInput {
  draftMorningStatus: string | number | null | undefined;
  draftEveningStatus: string | number | null | undefined;
  persistedMorningStatus: string | number | null | undefined;
  persistedEveningStatus: string | number | null | undefined;
}

/**
 * Whether this edit would make the server generate the ETA line: THIS edit
 * moves a status column (Morning or Evening) to SSC Pending from something that
 * was NOT already SSC Pending. Transition-only, exactly like the server's
 * `movedToSscPending`, so re-saving an already-SSC row never regenerates a
 * fresher ETA over a remark the team has since written.
 */
export function isSscEtaRemarkTriggered(
  input: SscEtaRemarkTriggerInput,
): boolean {
  const setsSscPending = (
    draft: string | number | null | undefined,
    persisted: string | number | null | undefined,
  ): boolean =>
    isSscPendingStatus(clean(draft)) && !isSscPendingStatus(clean(persisted));

  return (
    setsSscPending(input.draftMorningStatus, input.persistedMorningStatus) ||
    setsSscPending(input.draftEveningStatus, input.persistedEveningStatus)
  );
}

export interface SscEtaRemarkPreviewInput extends SscEtaRemarkTriggerInput {
  draftRemark: string | number | null | undefined;
  persistedRemark?: string | number | null | undefined;
  /** The row's Case Created Time — the ETA is derived purely from this. */
  caseCreatedTime: string | number | null | undefined;
}

/**
 * The value the Current Remarks box should be prefilled with, or null to leave
 * it alone. Same never-clobber-the-user rules as the scheduling preview: only
 * an empty box, the "Manual Entry Required" sentinel, an untouched saved
 * remark, or a previously auto-generated line (either the ETA or a stale
 * "Scheduled on …") is replaced. Returns null when the row has no usable Case
 * Created Time, so the box never shows a half-built "ETA ".
 */
export function sscEtaRemarkPreviewValue(
  input: SscEtaRemarkPreviewInput,
): string | null {
  if (!isSscEtaRemarkTriggered(input)) {
    return null;
  }

  const generated = buildSscPendingRemark(clean(input.caseCreatedTime));
  if (!generated) {
    return null;
  }

  const remark = clean(input.draftRemark);
  const untouchedThisSession = remark === clean(input.persistedRemark);
  const replaceable =
    remark === "" ||
    untouchedThisSession ||
    isAutoSscEtaRemark(remark) ||
    isAutoScheduledRemark(remark);
  if (!replaceable) {
    return null;
  }

  return remark === generated ? null : generated;
}
