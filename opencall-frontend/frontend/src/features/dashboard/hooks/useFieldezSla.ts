import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getFieldezSla,
  slaTicketKey,
  type FieldezSlaFreshness,
  type FieldezSlaRow,
} from "../../../lib/fieldezSlaApiClient";

/**
 * FieldEZ's SLA for every open call, kept in memory for the screens that show it.
 *
 * Loaded from OpenCall's own table — never from FieldEZ — so a lapsed FieldEZ session or a
 * slow FieldEZ can never make the Open Call Report slow. The FieldEZ worker refreshes that
 * table every fifteen minutes; this re-reads it on a slower beat so a screen left open all
 * morning does not go on showing breakfast's numbers.
 *
 * A FAILURE IS NOT AN ERROR HERE. The SLA decorates a report that stands perfectly well
 * without it, so a failed load leaves an empty map and a message rather than taking the
 * report down. What it must never do is leave the map populated with something stale while
 * claiming to be current — hence the freshness, which the screen shows.
 */

/** How often to re-read. Half the worker's own cadence, so a change shows up promptly. */
const REFRESH_MS = 7 * 60 * 1000;

export interface FieldezSlaState {
  /** Keyed by the work order with punctuation stripped, for joining to report rows. */
  byTicket: ReadonlyMap<string, FieldezSlaRow>;
  freshness: FieldezSlaFreshness | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useFieldezSla(token: string | undefined, enabled: boolean): FieldezSlaState {
  const [rows, setRows] = useState<FieldezSlaRow[]>([]);
  const [freshness, setFreshness] = useState<FieldezSlaFreshness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // A load that finishes after the token changed must not write its result over the new
  // one's — the classic way a screen ends up showing a previous user's data.
  const runIdRef = useRef(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !token) return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    let cancelled = false;

    const load = () => {
      setLoading(true);
      void getFieldezSla(token)
        .then((response) => {
          if (cancelled || runIdRef.current !== runId) return;
          setRows(response.records);
          setFreshness(response.freshness);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (cancelled || runIdRef.current !== runId) return;
          setError(cause instanceof Error ? cause.message : "could not be read");
        })
        .finally(() => {
          if (cancelled || runIdRef.current !== runId) return;
          setLoading(false);
        });
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, enabled, nonce]);

  const byTicket = useMemo(() => {
    const map = new Map<string, FieldezSlaRow>();
    for (const row of rows) {
      const key = row.ticketKey || slaTicketKey(row.ticketNo);
      if (key) map.set(key, row);
    }
    return map;
  }, [rows]);

  return { byTicket, freshness, loading, error, reload };
}
