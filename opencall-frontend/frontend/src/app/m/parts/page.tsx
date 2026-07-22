"use client";

import { useCallback, useEffect, useState } from "react";
import { AppBar } from "../AppBar";
import { canSeeMobileSection, isSuperAdminSession, useMobileSession } from "../session";
import {
  listCatalogParts,
  type CatalogPart,
} from "../../../lib/partsCatalogApiClient";

const PER_PAGE = 50;

/**
 * Parts Catalog — read-only on the phone.
 *
 * Import / Delete-all are SUPER_ADMIN-only destructive actions that replace the whole
 * catalog in one transaction; they stay on the desktop where the file and the confirmation
 * belong. The search here debounces (the web does not) because every keystroke on a phone
 * would otherwise fire a request, and the responses can arrive out of order.
 */
export default function MobilePartsCatalogPage() {
  const { session } = useMobileSession();

  const allowed =
    isSuperAdminSession(session) || canSeeMobileSection(session, "parts-catalog");

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CatalogPart[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // 300 ms debounce — a phone keyboard would otherwise fire one request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const load = useCallback(async () => {
    if (!session || !allowed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listCatalogParts(session.token, {
        ...(debounced ? { search: debounced } : {}),
        page,
        perPage: PER_PAGE,
      });
      setItems(res.items);
      setTotal(res.total);
      setPages(res.pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load parts");
    } finally {
      setLoading(false);
    }
  }, [session, allowed, debounced, page]);

  useEffect(() => {
    // A stale response from a slower earlier query must not clobber a newer one.
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!allowed) {
    return (
      <>
        <AppBar title="Parts Catalog" back />
        <main className="mMain">
          <div className="mCard">
            <div className="mMuted">You do not have access to the Parts Catalog.</div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar
        title="Parts Catalog"
        subtitle={`${total.toLocaleString("en-IN")} parts`}
        back
        action={
          <button type="button" className="mIconBtn" aria-label="Refresh" onClick={() => void load()}>
            ↻
          </button>
        }
      />
      <main className="mMain">
        {error && <div className="mError">{error}</div>}

        <input
          className="mSearch"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search part number, description, HSN…"
        />

        {loading && items.length === 0 ? (
          <div className="mCard" style={{ textAlign: "center", padding: 26, marginTop: 12 }}>
            <div className="mSpinner" />
            <div className="mMuted">Loading parts…</div>
          </div>
        ) : items.length === 0 ? (
          <div className="mCard" style={{ marginTop: 12 }}>
            <div className="mMuted">
              {debounced ? "No parts match that search." : "No parts in the catalog yet."}
            </div>
          </div>
        ) : (
          <>
            <div className="mList" style={{ marginTop: 12 }}>
              {items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="mRow"
                  onClick={() => setOpen(open === p.id ? null : p.id)}
                >
                  <div className="mRow__top">
                    <span className="mRow__title" style={{ fontWeight: 750 }}>
                      {p.partNumber || "-"}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                      {p.price ? `₹${p.price.toLocaleString("en-IN")}` : "-"}
                    </span>
                  </div>
                  <div className="mRow__meta">{p.description || "-"}</div>

                  {open === p.id && (
                    <div
                      style={{
                        marginTop: 11,
                        paddingTop: 11,
                        borderTop: "1px solid var(--m-border)",
                        display: "grid",
                        gap: 5,
                      }}
                    >
                      <Field label="Category" value={p.category} />
                      <Field label="HSN Code" value={p.hsnCode} />
                      <Field label="IGST" value={p.igst} />
                      <Field label="CGST" value={p.cgst} />
                      <Field label="SGST" value={p.sgst} />
                      <Field label="EOSL Flag" value={p.eoslFlag} />
                      <Field label="Validity" value={p.validity} />
                      <Field label="Parts Status" value={p.partsStatus} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {pages > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <button
                  type="button"
                  className="mBtn mBtn--ghost"
                  style={{ width: "auto", padding: "0 16px" }}
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹ Prev
                </button>
                <span className="mMuted" style={{ fontSize: 12.5 }}>
                  Page {page} of {pages}
                </span>
                <button
                  type="button"
                  className="mBtn mBtn--ghost"
                  style={{ width: "auto", padding: "0 16px" }}
                  disabled={page >= pages || loading}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  Next ›
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function Field({ label, value }: Readonly<{ label: string; value: string | null }>) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}>
      <span className="mMuted" style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ textAlign: "right", wordBreak: "break-word" }}>{value || "-"}</span>
    </div>
  );
}
