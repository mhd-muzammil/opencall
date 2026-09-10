import React from "react";
import type { ClosureImportStatus } from "../../../../lib/closureDateApiClient";

/**
 * How often the FieldEZ worker's closure job is expected to run, and how many missed
 * cycles turn the badge red. Mirrors FIELDEZ_CLOSURE_INTERVAL_MS's default (15 min): the
 * frontend cannot read the worker's env, so this is the assumption the staleness warning
 * is calibrated to. A worker that has silently died keeps serving yesterday's statuses
 * while the stored row count still looks perfectly healthy.
 *
 * Keep this in step with the worker's default — left at an hour, a dead sync would go
 * unflagged for three hours instead of forty-five minutes.
 */
export const CLOSURE_SYNC_INTERVAL_MS = 15 * 60 * 1000;
export const CLOSURE_SYNC_STALE_AFTER_MS = 3 * CLOSURE_SYNC_INTERVAL_MS;

/** "2026-07-31T09:05:00Z" -> "14:35" in IST, or "" when unparseable. */
export function formatIstTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function ageMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  return Number.isNaN(then) ? null : Date.now() - then;
}

export interface ClosureFreshness {
  /** Nothing has ever been imported — the badge is not rendered at all. */
  present: boolean;
  stale: boolean;
  /** Sync alive, but Flex has reported nothing new for a while. Neutral, not an alarm. */
  noNewData: boolean;
  label: string;
  time: string;
  title: string;
}

/**
 * Reads the closure-import status into the three states the badge can be in.
 *
 * Liveness comes from the last sync RUN (`lastSyncAt`) when the backend reports it: an
 * empty new-day export imports 0 rows, so `lastImportedAt` legitimately sits at last
 * night's final import all morning while the worker is perfectly healthy. Older backends
 * (pre-`closure_sync_runs`) only send `lastImportedAt` — fall back to it.
 */
export function readClosureFreshness(
  status: ClosureImportStatus | null,
): ClosureFreshness {
  const syncAt = status?.lastSyncAt ?? status?.lastImportedAt ?? null;
  if (!status || !syncAt) {
    return {
      present: false,
      stale: false,
      noNewData: false,
      label: "",
      time: "",
      title: "",
    };
  }

  const syncAge = ageMs(syncAt);
  const stale = syncAge !== null && syncAge > CLOSURE_SYNC_STALE_AFTER_MS;

  const dataAge = ageMs(status.lastImportedAt);
  const noNewData =
    !stale &&
    status.lastSyncAt != null &&
    dataAge !== null &&
    dataAge > CLOSURE_SYNC_STALE_AFTER_MS;

  const source = status.lastSyncSource ?? status.lastImportSource;
  return {
    present: true,
    stale,
    noNewData,
    label: source === "AUTO" ? "Auto-synced" : "Imported",
    time: formatIstTime(syncAt),
    title: stale
      ? "No sync has completed for over 3 cycles — the FieldEZ worker may be down."
      : noNewData
        ? `Sync is running; the last closure data arrived ${formatIstTime(
            status.lastImportedAt,
          )} (Flex has reported nothing new since).`
        : `Last closure import (${status.lastImportSource ?? "?"})`,
  };
}

/**
 * The FieldEZ worker's liveness probe, wearing a timestamp.
 *
 * Three states, and the difference between the last two matters: red means nothing has
 * synced (the worker is probably dead), grey means the sync is running fine and Flex
 * simply has no new closures yet — which is every morning until the first one lands.
 */
export function SyncBadge({ freshness }: Readonly<{ freshness: ClosureFreshness }>) {
  if (!freshness.present) return null;
  const tone = freshness.stale ? " ccStale" : freshness.noNewData ? " ccIdle" : "";
  return (
    <span className={`ccSync${tone}`} title={freshness.title}>
      <i />
      {freshness.label} {freshness.time}
      {freshness.stale
        ? " · stale"
        : freshness.noNewData
          ? " · no new closures yet"
          : ""}
    </span>
  );
}
