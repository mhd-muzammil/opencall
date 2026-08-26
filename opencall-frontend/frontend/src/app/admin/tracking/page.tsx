"use client";

import { useEffect, useState } from "react";
import LiveTrackingPanel from "../../../features/dashboard/components/LiveTrackingPanel";
import { readSession } from "../../../lib/session";

/**
 * The board also has a section in the admin console now. This route stays so an
 * existing bookmark still opens it, and so it can be shown on its own screen —
 * it only supplies the token the panel needs.
 */
export default function LiveTrackingPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(readSession()?.token ?? null);
  }, []);

  return <LiveTrackingPanel token={token} />;
}
