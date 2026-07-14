"use client";

import { useEffect, useState } from "react";
import { readSession } from "../../../lib/session";
import {
  getRecordLayout,
  getRecordColumnsCatalog,
  saveRecordLayout,
  resetRecordLayout,
} from "../../../lib/recordLayoutApiClient";
import {
  getSpecialAccessRecordLayout,
  getSpecialAccessRecordColumnsCatalog,
  saveSpecialAccessRecordLayout,
  resetSpecialAccessRecordLayout,
} from "../../../lib/specialAccessApiClient";
import { RecordFormatPage } from "../../../features/dashboard/components/RecordFormatPage";

const EMPTY_CATALOG = { standard: [], extra: [], columns: [] };

export default function AdminRecordFormatPage() {
  const [token, setToken] = useState<string | null>(null);
  const [initialColumns, setInitialColumns] = useState<string[] | null>(null);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Special-access logins are not rows in `users`, so they read/write their layout
  // through their own scoped endpoints. Regular users keep the original ones.
  const [isSpecialAccess, setSpecialAccess] = useState(false);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      setLoaded(true);
      return;
    }
    const special = session.user.role === "SPECIAL_ACCESS";
    setSpecialAccess(special);
    setToken(session.token);

    const loadLayout = special ? getSpecialAccessRecordLayout : getRecordLayout;
    const loadCatalog = special
      ? getSpecialAccessRecordColumnsCatalog
      : getRecordColumnsCatalog;

    Promise.all([
      loadLayout(session.token).catch(() => null),
      loadCatalog(session.token).catch(() => EMPTY_CATALOG),
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
      save={isSpecialAccess ? saveSpecialAccessRecordLayout : saveRecordLayout}
      reset={isSpecialAccess ? resetSpecialAccessRecordLayout : resetRecordLayout}
      onSaved={() => {}}
    />
  );
}
