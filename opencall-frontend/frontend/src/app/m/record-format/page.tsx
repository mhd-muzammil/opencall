"use client";

import { useEffect, useState } from "react";
import { AppBar } from "../AppBar";
import { canSeeMobileSection, useMobileSession } from "../session";
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

/**
 * Record Format on the phone — which columns the Records table shows, in what order.
 *
 * The desktop editor itself, loaded the same way `/admin/record-format` loads it. The
 * layout it writes is the one the Records table reads on both, so a second implementation
 * could silently save a different shape and the columns someone arranged on their phone
 * would not be the columns they see on the laptop.
 *
 * Special-access logins are not rows in `users`, so they read and write through their own
 * scoped endpoints — the same fork the desktop route makes.
 */
export default function MobileRecordFormatPage() {
  const { session } = useMobileSession();
  const allowed = canSeeMobileSection(session, "record-format");

  const [initialColumns, setInitialColumns] = useState<string[] | null>(null);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isSpecialAccess, setSpecialAccess] = useState(false);

  useEffect(() => {
    if (!session || !allowed) {
      setLoaded(true);
      return;
    }
    const special = session.user.role === "SPECIAL_ACCESS";
    setSpecialAccess(special);

    const loadLayout = special ? getSpecialAccessRecordLayout : getRecordLayout;
    const loadCatalog = special
      ? getSpecialAccessRecordColumnsCatalog
      : getRecordColumnsCatalog;

    void Promise.all([
      loadLayout(session.token).catch(() => null),
      loadCatalog(session.token).catch(() => EMPTY_CATALOG),
    ])
      .then(([layout, cat]) => {
        setInitialColumns(layout?.orderedColumns ?? null);
        setCatalog(cat.columns);
        setExtraColumns(cat.extra);
      })
      .finally(() => setLoaded(true));
  }, [session, allowed]);

  if (!session) return null;

  if (!allowed) {
    return (
      <>
        <AppBar title="Record Format" back />
        <main className="mMain">
          <div className="mCard mMuted">
            This login does not have access to Record Format.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar title="Record Format" subtitle="Columns shown in Records" back />
      <main className="mMain">
        {!loaded ? (
          <div className="mCenter">
            <div>
              <div className="mSpinner" />
              <div className="mMuted">Loading record format…</div>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto", minWidth: 0 }}>
            <RecordFormatPage
              token={session.token}
              initialColumns={initialColumns}
              catalog={catalog}
              extraColumns={extraColumns}
              save={isSpecialAccess ? saveSpecialAccessRecordLayout : saveRecordLayout}
              reset={isSpecialAccess ? resetSpecialAccessRecordLayout : resetRecordLayout}
              onSaved={() => {}}
            />
          </div>
        )}
      </main>
    </>
  );
}
