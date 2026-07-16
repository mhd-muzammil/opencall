import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteAllCatalogParts,
  importCatalogParts,
  listCatalogParts,
  type CatalogPart,
} from "../../../lib/partsCatalogApiClient";

/**
 * Parts Catalog — OpenCall's copy of the HP Stock RMA parts. View + search always; the
 * import and delete-all controls appear only when `canManage` (SUPER_ADMIN) is set.
 */
export function PartsCatalogPage({
  token,
  canManage,
}: Readonly<{ token: string; canManage: boolean }>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CatalogPart[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const perPage = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCatalogParts(token, { search, page, perPage });
      setItems(res.items);
      setTotal(res.total);
      setPages(res.pages);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load parts");
    } finally {
      setLoading(false);
    }
  }, [token, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset to page 1 whenever the search term changes.
  useEffect(() => {
    setPage(1);
  }, [search]);

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await importCatalogParts(token, file);
      setMessage(
        `Imported ${res.imported} parts (skipped ${res.skippedEmpty} without a part number).`,
      );
      setPage(1);
      await load();
    } catch (error) {
      setMessage(
        `Import failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteAll() {
    if (!window.confirm("Delete the entire parts catalog? This cannot be undone.")) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await deleteAllCatalogParts(token);
      setMessage(`Deleted ${res.deleted} parts.`);
      setPage(1);
      await load();
    } catch (error) {
      setMessage(
        `Delete failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const cellStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-color, #eef0f3)",
    whiteSpace: "nowrap",
  };
  const headStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontWeight: 700,
    textAlign: "left",
    borderBottom: "1px solid var(--border-color, #e5e7eb)",
    background: "var(--th-bg, #f3f4f6)",
    whiteSpace: "nowrap",
  };

  return (
    <section style={{ padding: "8px 4px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Parts Catalog</h2>
          <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#6b7280" }}>
            {total.toLocaleString()} parts
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search part number, description, HSN…"
            style={{
              width: "300px",
              maxWidth: "100%",
              padding: "8px 14px",
              fontSize: "13px",
              borderRadius: "8px",
              border: "1px solid var(--border-color, #d1d5db)",
              background: "var(--input-bg, #f9fafb)",
            }}
          />
          {canManage && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx"
                style={{ display: "none" }}
                onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: "8px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "none",
                  background: busy ? "#a5b4fc" : "#4f46e5",
                  color: "#fff",
                  cursor: busy ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {busy ? "Working…" : "⬆ Import Excel"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDeleteAll()}
                style={{
                  padding: "8px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#dc2626",
                  cursor: busy ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Delete all
              </button>
            </>
          )}
        </div>
      </div>

      {message && (
        <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>
          {message}
        </div>
      )}

      <div style={{ overflowX: "auto", borderRadius: "8px", border: "1px solid var(--border-color, #e5e7eb)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              <th style={headStyle}>Part Number</th>
              <th style={headStyle}>Description</th>
              <th style={headStyle}>Category</th>
              <th style={headStyle}>Price</th>
              <th style={headStyle}>HSN</th>
              <th style={headStyle}>IGST</th>
              <th style={headStyle}>CGST</th>
              <th style={headStyle}>SGST</th>
              <th style={headStyle}>EOSL</th>
              <th style={headStyle}>Validity</th>
              <th style={headStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} style={{ ...cellStyle, textAlign: "center", color: "#6b7280", padding: "28px" }}>
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ ...cellStyle, textAlign: "center", color: "#6b7280", padding: "28px" }}>
                  {search ? `No parts matching "${search}"` : "No parts in the catalog yet."}
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{p.partNumber}</td>
                  <td style={{ ...cellStyle, whiteSpace: "normal", minWidth: "260px" }}>{p.description}</td>
                  <td style={cellStyle}>{p.category || "-"}</td>
                  <td style={cellStyle}>
                    {p.price ? `₹${p.price.toLocaleString()}` : "-"}
                  </td>
                  <td style={cellStyle}>{p.hsnCode || "-"}</td>
                  <td style={cellStyle}>{p.igst || "-"}</td>
                  <td style={cellStyle}>{p.cgst || "-"}</td>
                  <td style={cellStyle}>{p.sgst || "-"}</td>
                  <td style={cellStyle}>{p.eoslFlag || "-"}</td>
                  <td style={cellStyle}>{p.validity || "-"}</td>
                  <td style={cellStyle}>{p.partsStatus || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "14px" }}>
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={pagerBtn(page <= 1 || loading)}
          >
            ‹ Prev
          </button>
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            Page {page} of {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages || loading}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            style={pagerBtn(page >= pages || loading)}
          >
            Next ›
          </button>
        </div>
      )}
    </section>
  );
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    fontSize: "13px",
    fontWeight: 600,
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: disabled ? "#9ca3af" : "#374151",
    cursor: disabled ? "default" : "pointer",
  };
}
