"use client";

import { useEffect, useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { useMobileSession } from "../session";
import { getAdminEngineers } from "../../../lib/apiClient";
import { listAdminRegions } from "../../../lib/adminApiClient";
import type { Engineer } from "../../../lib/api/types";

/** Read-only engineers directory for the app: search, region, HP / Vendor / RTPL IDs. */
export default function MobileEngineersPage() {
  const { session } = useMobileSession();
  const [engineers, setEngineers] = useState<Engineer[] | null>(null);
  const [regionNames, setRegionNames] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      try {
        const [list, regions] = await Promise.all([
          getAdminEngineers(session.token, { limit: 500 }),
          listAdminRegions(session.token).catch(() => []),
        ]);
        if (cancelled) return;
        setEngineers(list.rows);
        setRegionNames(new Map(regions.map((r) => [r.id, r.name])));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load engineers");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const filtered = useMemo(() => {
    if (!engineers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return engineers;
    return engineers.filter((e) =>
      [e.engineerName, e.engineerCode ?? "", e.hpId ?? "", e.vendorId ?? "", e.phone ?? ""]
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [engineers, search]);

  return (
    <>
      <AppBar title="Engineers" back />
      <main className="mMain">
        {error && <div className="mError">{error}</div>}

        <input
          className="mSearch"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, RTPL ID, HP ID…"
          style={{ marginBottom: 12 }}
        />

        {!engineers ? (
          <div className="mCard" style={{ textAlign: "center", padding: 26 }}>
            <div className="mSpinner" />
            <div className="mMuted">Loading engineers…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mCard">
            <div className="mMuted">
              {search ? `No engineer matches "${search}"` : "No engineers yet."}
            </div>
          </div>
        ) : (
          <>
            <div className="mMuted" style={{ margin: "0 2px 10px" }}>
              {filtered.length} {filtered.length === 1 ? "engineer" : "engineers"}
            </div>
            <div className="mList">
              {filtered.map((e) => (
                <div key={e.id} className="mRow" style={{ cursor: "default" }}>
                  <div className="mRow__top">
                    <span className="mRow__title">{e.engineerName}</span>
                    <span className={`mChip ${e.isActive ? "mChip--good" : "mChip--danger"}`}>
                      {e.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mRow__meta">
                    {regionNames.get(e.regionId) ?? "—"}
                    {e.phone ? ` · ${e.phone}` : ""}
                    <br />
                    RTPL {e.engineerCode || "—"} · HP {e.hpId || "—"} · Vendor{" "}
                    {e.vendorId || "—"}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
