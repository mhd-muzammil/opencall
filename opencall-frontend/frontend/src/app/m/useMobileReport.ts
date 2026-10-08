"use client";

import { useCallback, useEffect, useState } from "react";
import { getReportHistory, generateReport, getRtplStatusesDropdown } from "../../lib/apiClient";
import { getLatestCompletedReportSession } from "../../lib/reportHistorySelection";
import {
  fetchSpecialAccessReport,
  getSpecialAccessRtplStatusesDropdown,
} from "../../lib/specialAccessApiClient";
import { applyStatusBuckets } from "../../lib/statusBucketsClient";
import type { GeneratedReportResponse } from "../../lib/api/types";
import type { ClientSession } from "../../lib/session";

/**
 * Loads the latest completed report for the mobile screens — the same two-step the web
 * app uses (newest completed history session, then regenerate it read-only), and the
 * scoped endpoint for special-access logins. Read-only: nothing is created or mutated.
 */
export interface MobileReportState {
  report: GeneratedReportResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useMobileReport(session: ClientSession | null): MobileReportState {
  const [report, setReport] = useState<GeneratedReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        // Which BOD/EOD row each status counts under — loaded before the report
        // so the first render already counts with it. Never blocks the report:
        // without it the screens fall back to the keyword rules.
        await (session.user.role === "SPECIAL_ACCESS"
          ? getSpecialAccessRtplStatusesDropdown(session.token)
          : getRtplStatusesDropdown(session.token)
        )
          .then(applyStatusBuckets)
          .catch(() => undefined);

        if (session.user.role === "SPECIAL_ACCESS") {
          const scoped = await fetchSpecialAccessReport(session.token);
          if (!cancelled) setReport(scoped.report);
          return;
        }

        const sessions = await getReportHistory(session.token);
        const latest = getLatestCompletedReportSession(sessions);
        if (!latest?.flexUploadBatchId) {
          if (!cancelled) setReport(null);
          return;
        }
        const generated = await generateReport({
          token: session.token,
          regionId:
            session.user.role === "REGION_ADMIN"
              ? session.user.regionId ?? ""
              : latest.regionId ?? "",
          reportDate: latest.reportDate ?? "",
          flexUploadBatchId: latest.flexUploadBatchId,
          ...(latest.renderwaysUploadBatchId
            ? { renderwaysUploadBatchId: latest.renderwaysUploadBatchId }
            : {}),
          ...(latest.callPlanUploadBatchId
            ? { callPlanUploadBatchId: latest.callPlanUploadBatchId }
            : {}),
        });
        if (!cancelled) setReport(generated);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the report");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, tick]);

  return { report, loading, error, reload };
}
