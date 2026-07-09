"use client";

import { useEffect, useState } from "react";
import { readSession } from "../../../lib/session";
import { getRecordLayout } from "../../../lib/recordLayoutApiClient";
import { RecordFormatPage } from "../../../features/dashboard/components/RecordFormatPage";

export default function AdminRecordFormatPage() {
  const [token, setToken] = useState<string | null>(null);
  const [initialColumns, setInitialColumns] = useState<string[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      setLoaded(true);
      return;
    }
    setToken(session.token);
    getRecordLayout(session.token)
      .then((layout) => setInitialColumns(layout?.orderedColumns ?? null))
      .catch(() => setInitialColumns(null))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) {
    return (
      <p className="muted" style={{ padding: 32 }}>
        Loading record format…
      </p>
    );
  }

  if (!token) {
    return (
      <p className="muted" style={{ padding: 32 }}>
        Session required.
      </p>
    );
  }

  // The editor persists to the backend; the operational Records page picks the
  // layout up on its next load. No live callback needed here.
  return (
    <RecordFormatPage
      token={token}
      initialColumns={initialColumns}
      onSaved={() => {}}
    />
  );
}
