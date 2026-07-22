"use client";

import { useCallback, useEffect, useState } from "react";
import { getReportHistory, generateReport } from "../../lib/apiClient";
import { getLatestCompletedReportSession } from "../../lib/reportHistorySelection";
import { fetchSpecialAccessReport } from "../../lib/specialAccessApiClient";
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
