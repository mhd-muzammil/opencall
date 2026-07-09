"use client";

import { useEffect, useState } from "react";
import { readSession } from "../../../lib/session";
import { getRecordLayout, getRecordColumnsCatalog } from "../../../lib/recordLayoutApiClient";
import { RecordFormatPage } from "../../../features/dashboard/components/RecordFormatPage";

export default function AdminRecordFormatPage() {
  const [token, setToken] = useState<string | null>(null);
  const [initialColumns, setInitialColumns] = useState<string[] | null>(null);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      setLoaded(true);
      return;
    }
    setToken(session.token);
    Promise.all([
      getRecordLayout(session.token).catch(() => null),
      getRecordColumnsCatalog(session.token).catch(() => ({ standard: [], extra: [], columns: [] })),
    ])
      .then(([layout, cat]) => {
        setInitialColumns(layout?.orderedColumns ?? null);
        setCatalog(cat.columns);
        setExtraColumns(cat.extra);
      })
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
      catalog={catalog}
      extraColumns={extraColumns}
      onSaved={() => {}}
    />
  );
}
