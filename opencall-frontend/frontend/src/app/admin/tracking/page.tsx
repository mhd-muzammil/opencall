"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import LiveTrackingPanel from "../../../features/dashboard/components/LiveTrackingPanel";
import { readSession } from "../../../lib/session";

/**
 * The board also has a section in the admin console now. This route stays so an
 * existing bookmark still opens it, and so it can be shown on its own screen —
 * it only supplies the token the panel needs.
 *
 * It also carries the deep link. Engineer Productivity's KM column links here
 * as ?engineer=<id>&date=<YYYY-MM-DD>, so following it lands on that engineer's
 * day rather than on a board of twenty-five rows to search through again.
 */
function LiveTrackingRoute() {
  const [token, setToken] = useState<string | null>(null);
  const params = useSearchParams();

  useEffect(() => {
    setToken(readSession()?.token ?? null);
  }, []);

  // params is null wherever there is no router around this component -- which
  // includes the existing test that renders the page on its own. A deep link is
  // an extra, so its absence must cost the board nothing.
  const rawEngineer = params?.get("engineer") ?? null;
  const engineerId = Number(rawEngineer);
  // Number("") is 0 and Number("abc") is NaN, and both would select nobody while
  // looking like a selection. Only a real positive id counts.
  const initialEngineerId =
    rawEngineer && Number.isInteger(engineerId) && engineerId > 0 ? engineerId : null;

  const rawDate = params?.get("date") ?? null;
  const initialDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

  return (
    <LiveTrackingPanel
      token={token}
      initialEngineerId={initialEngineerId}
      initialDate={initialDate}
    />
  );
}

export default function LiveTrackingPage() {
  // useSearchParams needs a Suspense boundary, or the whole route opts out of
  // static rendering at build time.
  return (
    <Suspense fallback={null}>
      <LiveTrackingRoute />
    </Suspense>
  );
}
