"use client";

import { useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import {
  AlertCircle,
  CalendarCheck,
  CalendarRange,
  Download,
  FileSpreadsheet,
  Fuel,
  Info,
  Loader2,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { canonicalEngineerName, mergeEngineerProductivityResults } from "@opencall/shared";
import { isApiAuthError } from "../../lib/api/http";
import { getProductivityRange } from "../../lib/apiClient";
import { getDayReport, getRoster, getRosterKm, type RosterEngineer } from "../../lib/payrollTrackingApiClient";
import { getReportsAttendance, getReportsPayslips } from "../../lib/reportsApiClient";
import { dayReportColumns, type DayReportColumn } from "../../lib/dayReport";
import {
  attendanceInRange,
  buildAttendanceReport,
  statusShown,
  type AttendanceReport,
} from "../../lib/reports/attendanceReport";
import { PAY_NET, formatDays, formatMoney, payPeriod, payTotals, sortPayslips, toNumber } from "../../lib/reports/payReport";
import {
  REPORT_TITLES,
  downloadAllInOne,
  downloadReport,
  type ProductivityReportRow,
  type ReportKind,
  type ReportsBundle,
} from "../../lib/reports/reportsExcel";
import type { PayslipRow } from "../../lib/reportsApiClient";
import DaySummarySheet from "../dashboard/components/DaySummarySheet";
import EmployeePicker from "./EmployeePicker";
import { todayIsoDate } from "../dashboard/utils/dateUtils";

/**
 * REPORTS: the office's reports in one place, read-only, for everybody or one
 * person over a chosen period -- each viewed here and downloaded as Excel,
 * alone or all together in one workbook.
 *
 *   Petrol Report                 Live Tracking > Day Report > Summary
 *   Engineer Productivity Report  Engineer Productivity's table
 *   Attendance Report             Payroll > Attendance > Export Report
 *   Pay Report                    Payroll > Payslips > Employee Pay Report
 *
 * Nothing here writes anywhere: every source is read, and the screens the
 * reports came from are left exactly as they were.
 */

const MAX_DAYS = 31;

type Load<T> =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "error"; message: string };

interface Person {
  /** Payroll's employee id. */
  id: number;
  name: string;
  /** OpenCall's register name, for matching productivity rows. */
  registerName: string;
  branch: string;
  /** A field engineer (in OpenCall's register), so Petrol and Productivity apply. */
  engineer: boolean;
}

interface Asked {
  from: string;
  to: string;
  /** Who the reports cover. */
  people: Person[];
  /** Everybody, nobody picked: nothing is filtered out (relieved staff included). */
  everyone: boolean;
  /** Who, in words: "All employees", "All in HR", a name, "3 employees". */
  scope: string;
}

/** An FSE-day the engineer actually worked: logged in, on duty or moved. */
const workedDay = (c: DayReportColumn) => c.cell.logins.length > 0 || c.cell.on_duty || (c.cell.km ?? 0) > 0;

// ---- dates ------------------------------------------------------------------

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
/** The 25th–24th pay cycle `isoDate` falls in. */
function cycleOf(isoDate: string): { from: string; to: string } {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const start = d >= 25 ? new Date(Date.UTC(y, m - 1, 25)) : new Date(Date.UTC(y, m - 2, 25));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 24));
  return { from: iso(start), to: iso(end) };
}
const spanDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
/** "25 Oct 2026". */
const longDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const periodLabel = (from: string, to: string) => (from === to ? longDate(from) : `${longDate(from)} – ${longDate(to)}`);

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (n: number) => n.toLocaleString("en-IN");

// ---- design tokens ------------------------------------------------------------

const C = {
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  lineSoft: "#f1f5f9",
  surface: "#ffffff",
  subtle: "#f8fafc",
  brand: "#4f46e5",
  brandDark: "#4338ca",
  brandTint: "#eef2ff",
  brandLine: "#c7d2fe",
  danger: "#b91c1c",
  dangerTint: "#fef2f2",
  warn: "#b45309",
  warnTint: "#fffbeb",
};

const card: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  minWidth: 0,
};
const control: CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 8,
  border: `1px solid #cbd5e1`,
  font: "inherit",
  fontSize: 14,
  background: C.surface,
  color: C.ink,
  width: "100%",
  boxSizing: "border-box",
};
const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: C.muted,
  marginBottom: 6,
  letterSpacing: "0.01em",
};
const btnBase: CSSProperties = {
  font: "inherit",
  fontSize: 14,
  fontWeight: 600,
  height: 40,
  minHeight: 0,
  padding: "0 16px",
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  whiteSpace: "nowrap",
  cursor: "pointer",
  boxShadow: "none",
};
const primaryBtn = (enabled: boolean): CSSProperties => ({
  ...btnBase,
  border: `1px solid ${enabled ? C.brand : "#cbd5e1"}`,
  background: enabled ? C.brand : "#e2e8f0",
  color: enabled ? "#fff" : C.faint,
  cursor: enabled ? "pointer" : "not-allowed",
});
const secondaryBtn = (enabled: boolean): CSSProperties => ({
  ...btnBase,
  border: `1px solid ${enabled ? C.brandLine : C.line}`,
  background: enabled ? C.surface : C.subtle,
  color: enabled ? C.brandDark : C.faint,
  cursor: enabled ? "pointer" : "not-allowed",
});

const th: CSSProperties = {
  position: "sticky",
  top: 0,
  background: C.subtle,
  color: C.muted,
  fontSize: 12,
  fontWeight: 600,
  textTransform: "none",
  letterSpacing: "normal",
  padding: "10px 12px",
  borderBottom: `1px solid ${C.line}`,
  whiteSpace: "nowrap",
  textAlign: "center",
  zIndex: 1,
};
const td: CSSProperties = {
  padding: "9px 12px",
  borderBottom: `1px solid ${C.lineSoft}`,
  fontSize: 13,
  color: C.body,
  textAlign: "center",
  whiteSpace: "nowrap",
  background: C.surface,
};
const tdLeft: CSSProperties = { ...td, textAlign: "left" };
const tdNum: CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const totalCell: CSSProperties = { background: C.subtle, fontWeight: 700, color: C.ink, borderTop: `1px solid ${C.line}` };

type Icon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;

const REPORTS: Array<{ key: ReportKind; Icon: Icon; tint: string; color: string; hint: string; source: string }> = [
  {
    key: "petrol",
    Icon: Fuel,
    tint: "#fff7ed",
    color: "#c2410c",
    hint: "Login, logout, calls and kilometres for each field engineer, day by day.",
    source: "Live Tracking › Day Report › Summary",
  },
  {
    key: "productivity",
    Icon: TrendingUp,
    tint: "#ecfdf5",
    color: "#047857",
    hint: "Calls assigned, attended and closed per engineer, with kilometres travelled.",
    source: "Engineer Productivity",
  },
  {
    key: "attendance",
    Icon: CalendarCheck,
    tint: "#eff6ff",
    color: "#1d4ed8",
    hint: "Each person's attendance for every day of the period, with totals.",
    source: "Payroll › Attendance",
  },
  {
    key: "pay",
    Icon: Wallet,
    tint: "#f5f3ff",
    color: "#6d28d9",
    hint: "Payslip figures for each pay month (25th–24th cycle) the period falls in.",
    source: "Payroll › Payslips › Employee Pay Report",
  },
];

const STATUS_SHORT: Record<string, { text: string; label: string; color: string; bg: string }> = {
  Present: { text: "P", label: "Present", color: "#15803d", bg: "#dcfce7" },
  Overtime: { text: "OT", label: "Overtime", color: "#1d4ed8", bg: "#dbeafe" },
  overTime: { text: "OT", label: "Overtime", color: "#1d4ed8", bg: "#dbeafe" },
  Absent: { text: "A", label: "Absent", color: "#b91c1c", bg: "#fee2e2" },
  "Half Day": { text: "HD", label: "Half Day", color: "#be185d", bg: "#fce7f3" },
  Sunday: { text: "S", label: "Sunday", color: "#475569", bg: "#f1f5f9" },
  Holiday: { text: "H", label: "Holiday", color: "#b45309", bg: "#fef3c7" },
  Late: { text: "L", label: "Late", color: "#b45309", bg: "#fef3c7" },
};
const LEGEND = ["Present", "Overtime", "Absent", "Half Day", "Sunday", "Holiday", "Late"] as const;

type QuickKey = "custom" | "today" | "current" | "last";

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export interface ReportsPageProps {
  token: string | null;
  /** Called when the API says the session has expired. */
  onSessionExpired?: () => void;
}

export default function ReportsPage({ token, onSessionExpired }: ReportsPageProps) {
  const today = todayIsoDate();
  const current = cycleOf(today);
  const lastCycle = cycleOf(addDays(current.from, -1));
  const clamp = (r: { from: string; to: string }) => ({ from: r.from, to: r.to > today ? today : r.to });

  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(clamp(current).to);
  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(null);
  const [askedKey, setAskedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<ReportKind>("petrol");

  const [people, setPeople] = useState<Person[] | null>(null);
  const [peopleError, setPeopleError] = useState<string | null>(null);

  const [asked, setAsked] = useState<Asked | null>(null);
  const [petrol, setPetrol] = useState<Load<DayReportColumn[]>>({ state: "idle" });
  const [productivity, setProductivity] = useState<Load<ProductivityReportRow[]>>({ state: "idle" });
  const [attendance, setAttendance] = useState<Load<AttendanceReport>>({ state: "idle" });
  const [pay, setPay] = useState<Load<PayslipRow[]>>({ state: "idle" });
  const [downloading, setDownloading] = useState<ReportKind | "all" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Everybody Payroll knows: the field engineers (matched to our register) and the office staff.
  useEffect(() => {
    if (!token) return;
    let active = true;
    getRoster(token, today, { includeStaff: true })
      .then((answer) => {
        if (!active) return;
        const seen = new Set<number>();
        const list: Person[] = [];
        for (const row of answer.engineers as RosterEngineer[]) {
          if (row.engineer_id == null || seen.has(row.engineer_id)) continue;
          if (!row.staff && !row.matched) continue;
          seen.add(row.engineer_id);
          list.push({
            id: row.engineer_id,
            name: row.payroll_name || row.engineer_name,
            registerName: row.engineer_name,
            branch: row.branch || "",
            engineer: !row.staff,
          });
        }
        list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
        setPeople(list);
        if (!answer.configured) setPeopleError("Payroll is not connected on this server, so Payroll reports are unavailable.");
      })
      .catch((e) => {
        if (!active) return;
        if (isApiAuthError(e)) onSessionExpired?.();
        setPeopleError(errorText(e, "Could not load the employee list"));
        setPeople([]);
      });
    return () => {
      active = false;
    };
  }, [token, today, onSessionExpired]);

  const chosen = useMemo(
    () => (selectedIds ? (people ?? []).filter((p) => selectedIds.has(p.id)) : people ?? []),
    [people, selectedIds],
  );
  const everyone = selectedIds == null;
  const sameAs = (group: Person[]) => group.length > 0 && group.length === chosen.length && group.every((p) => selectedIds?.has(p.id));
  const scope = everyone
    ? "All employees"
    : sameAs((people ?? []).filter((p) => p.engineer))
      ? "Field engineers"
      : sameAs((people ?? []).filter((p) => !p.engineer))
        ? "Office staff"
        : chosen.length === 1
          ? chosen[0]!.name
          : `${chosen.length} employees`;
  const filterKey = selectedIds ? [...selectedIds].sort((a, b) => a - b).join(",") : "all";

  const days = from && to && from <= to ? spanDays(from, to) : 0;
  const rangeProblem = !from || !to
    ? "Choose both dates."
    : from > to
      ? "The start date must be on or before the end date."
      : days > MAX_DAYS
        ? `Choose a period of at most ${MAX_DAYS} days (one pay cycle).`
        : from > today
          ? "The period cannot start in the future."
          : null;
  const quick: QuickKey =
    from === today && to === today
      ? "today"
      : from === current.from && to === clamp(current).to
        ? "current"
        : from === lastCycle.from && to === lastCycle.to
          ? "last"
          : "custom";
  const onQuick = (key: QuickKey) => {
    const r = key === "today" ? { from: today, to: today } : key === "current" ? clamp(current) : key === "last" ? lastCycle : null;
    if (r) {
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const loads = { petrol, productivity, attendance, pay } as const;
  const anyLoading = Object.values(loads).some((l) => l.state === "loading");
  const canGenerate = !!token && people != null && !rangeProblem && !anyLoading;
  const changed = asked != null && (asked.from !== from || asked.to !== to || askedKey !== filterKey);

  const generate = () => {
    if (!canGenerate || !token) return;
    const q: Asked = { from, to, people: chosen, everyone, scope };
    setAsked(q);
    setAskedKey(filterKey);
    setDownloadError(null);
    void loadAll(token, q);
  };

  async function loadAll(tk: string, q: Asked) {
    const fail = (e: unknown, fallback: string) => {
      if (isApiAuthError(e)) onSessionExpired?.();
      return { state: "error" as const, message: errorText(e, fallback) };
    };
    const engineers = q.people.filter((p) => p.engineer);
    const ids = new Set(q.people.map((p) => p.id));

    // Petrol: the Day Report for the field engineers in scope, the days they worked.
    setPetrol({ state: "loading" });
    const petrolIds = engineers.map((p) => p.id);
    const petrolJob = (async () => {
      if (petrolIds.length === 0) return setPetrol({ state: "ready", data: [] });
      try {
        const answer = await getDayReport(tk, q.from, q.to, petrolIds);
        const names = new Map(engineers.map((p) => [p.id, p.registerName] as const));
        setPetrol({ state: "ready", data: dayReportColumns(answer, names).filter(workedDay) });
      } catch (e) {
        setPetrol(fail(e, "Could not load the Petrol Report"));
      }
    })();

    // Engineer Productivity: the range's per-engineer counts, with each one's km.
    setProductivity({ state: "loading" });
    const productivityJob = (async () => {
      if (engineers.length === 0) return setProductivity({ state: "ready", data: [] });
      try {
        const [range, km] = await Promise.all([
          getProductivityRange(tk, q.from, q.to),
          getRosterKm(tk, q.from, q.to).catch(() => null),
        ]);
        const key = (name: string) => canonicalEngineerName(name).trim().toLowerCase();
        const kmByName = new Map<string, number>();
        for (const row of km?.engineers ?? []) {
          const k = key(String(row.engineer_name || ""));
          if (k) kmByName.set(k, (kmByName.get(k) ?? 0) + (row.distance_km ?? 0));
        }
        const merged = mergeEngineerProductivityResults(range.regions.map((r) => r.productivity));
        const wanted = q.everyone ? null : new Set(engineers.flatMap((p) => [key(p.registerName), key(p.name)]));
        const rows: ProductivityReportRow[] = merged.list
          .filter((item) => !wanted || wanted.has(key(item.name)))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
          .map((item) => ({
            name: item.name,
            region: item.regionName || item.regionCode || "",
            km: kmByName.has(key(item.name)) ? kmByName.get(key(item.name))! : km ? 0 : null,
            assigned: item.assigned,
            attended: item.attended,
            closed: item.closed,
            partOrdered: item.partOrdered ?? 0,
            underObservation: item.underObservation ?? 0,
            customerPending: item.cxReschedule ?? 0,
            engineerDelay: item.engineerDelay ?? 0,
          }));
        setProductivity({ state: "ready", data: rows });
      } catch (e) {
        setProductivity(fail(e, "Could not load the Engineer Productivity Report"));
      }
    })();

    // Attendance, from Payroll.
    setAttendance({ state: "loading" });
    const attendanceJob = (async () => {
      try {
        const answer = await getReportsAttendance(tk, q.from, q.to);
        if (!answer.configured) throw new Error("Payroll is not connected on this server.");
        let records = attendanceInRange(answer.records, q.from, q.to);
        if (!q.everyone) records = records.filter((r) => r.employee_id != null && ids.has(r.employee_id));
        setAttendance({ state: "ready", data: buildAttendanceReport(records) });
      } catch (e) {
        setAttendance(fail(e, "Could not load the Attendance Report"));
      }
    })();

    // Pay, from Payroll.
    setPay({ state: "loading" });
    const payJob = (async () => {
      try {
        const answer = await getReportsPayslips(tk, q.from, q.to);
        if (!answer.configured) throw new Error("Payroll is not connected on this server.");
        let slips = answer.payslips;
        if (!q.everyone) slips = slips.filter((s) => ids.has(Number(s.employee ?? s.employee_details?.id)));
        setPay({ state: "ready", data: sortPayslips(slips) });
      } catch (e) {
        setPay(fail(e, "Could not load the Pay Report"));
      }
    })();

    await Promise.all([petrolJob, productivityJob, attendanceJob, payJob]);
  }

  const bundle: ReportsBundle | null = asked
    ? {
        scope: asked.scope,
        from: asked.from,
        to: asked.to,
        petrol: petrol.state === "ready" ? petrol.data : null,
        productivity: productivity.state === "ready" ? productivity.data : null,
        attendance: attendance.state === "ready" ? attendance.data : null,
        pay: pay.state === "ready" ? pay.data : null,
      }
    : null;

  const download = async (which: ReportKind | "all") => {
    if (!bundle) return;
    setDownloading(which);
    setDownloadError(null);
    try {
      if (which === "all") {
        const notes: Partial<Record<ReportKind, string>> = {};
        (Object.keys(loads) as ReportKind[]).forEach((k) => {
          const l = loads[k];
          if (l.state === "error") notes[k] = `Not included: ${l.message}`;
        });
        await downloadAllInOne(bundle, notes);
      } else {
        await downloadReport(which, bundle);
      }
    } catch (e) {
      setDownloadError(errorText(e, "Could not create the Excel file"));
    } finally {
      setDownloading(null);
    }
  };

  // The figure each report card leads with.
  const headline = (kind: ReportKind): { value: string; caption: string } | null => {
    if ((kind === "petrol" || kind === "productivity") && asked && loads[kind].state === "ready" && asked.people.every((p) => !p.engineer)) {
      return { value: "Not applicable", caption: "For field engineers only" };
    }
    if (kind === "petrol" && petrol.state === "ready") {
      const km = petrol.data.reduce((s, c) => s + (c.cell.km || 0), 0);
      const worked = petrol.data.filter((c) => c.cell.logins.length > 0).length;
      return { value: `${num(Math.round(km * 10) / 10)} km`, caption: `${worked} working FSE-days` };
    }
    if (kind === "productivity" && productivity.state === "ready") {
      const sum = (k: keyof ProductivityReportRow) => productivity.data.reduce((s, r) => s + (Number(r[k]) || 0), 0);
      return { value: `${num(sum("closed"))} closed`, caption: `${num(sum("attended"))} attended of ${num(sum("assigned"))} assigned` };
    }
    if (kind === "attendance" && attendance.state === "ready") {
      const rows = attendance.data.rows;
      const present = rows.reduce((s, r) => s + r.present, 0);
      const absent = rows.reduce((s, r) => s + r.absent, 0);
      return { value: `${num(present)} present days`, caption: `${rows.length} ${rows.length === 1 ? "person" : "people"} · ${num(absent)} absent day${absent === 1 ? "" : "s"}` };
    }
    if (kind === "pay" && pay.state === "ready") {
      const net = pay.data.reduce((s, slip) => s + toNumber(slip[PAY_NET.key]), 0);
      return { value: inr(net), caption: `Net pay · ${pay.data.length} payslip${pay.data.length === 1 ? "" : "s"}` };
    }
    return null;
  };

  const allReady = Object.values(loads).every((l) => l.state !== "loading") && Object.values(loads).some((l) => l.state === "ready");
  const meta = REPORTS.find((r) => r.key === tab)!;
  const active = loads[tab];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, fontSize: 14, color: C.body }} data-testid="reports-page">
      <style>
        {"@keyframes reportsSpin{to{transform:rotate(360deg)}}.reportsSpin{animation:reportsSpin 1s linear infinite}" +
          "@media (max-width:1180px){.reportsFilters{grid-template-columns:1fr 1fr !important}}" +
          "@media (max-width:640px){.reportsFilters{grid-template-columns:1fr !important}}"}
      </style>

      {/* ---- Filters ---- */}
      <section style={{ ...card, padding: 20 }} aria-label="Report filters">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(240px, 1.8fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(170px, 1fr) auto",
            gap: 14,
            alignItems: "start",
          }}
          className="reportsFilters"
        >
          <div>
            <label style={fieldLabel} htmlFor="reports-person">
              <User size={12} style={{ verticalAlign: "-1px", marginRight: 4 }} />
              Employees
            </label>
            <EmployeePicker
              id="reports-person"
              people={people ?? []}
              selected={selectedIds}
              onChange={setSelectedIds}
              disabled={people == null}
            />
          </div>
          <div>
            <label style={fieldLabel} htmlFor="reports-from">From</label>
            <input id="reports-from" type="date" style={control} value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label style={fieldLabel} htmlFor="reports-to">To</label>
            <input id="reports-to" type="date" style={control} value={to} max={today} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label style={fieldLabel} htmlFor="reports-quick">
              <CalendarRange size={12} style={{ verticalAlign: "-1px", marginRight: 4 }} />
              Quick range
            </label>
            <select id="reports-quick" style={control} value={quick} onChange={(e) => onQuick(e.target.value as QuickKey)}>
              <option value="custom" disabled>Custom dates</option>
              <option value="today">Today</option>
              <option value="current">Current pay cycle</option>
              <option value="last">Last pay cycle</option>
            </select>
          </div>
          <div>
          <span style={{ ...fieldLabel, visibility: "hidden" }} aria-hidden>
            Generate
          </span>
          <button type="button" style={primaryBtn(canGenerate)} disabled={!canGenerate} onClick={generate}>
            {anyLoading ? <Loader2 size={16} className="reportsSpin" /> : null}
            {anyLoading ? "Generating…" : "Generate Reports"}
          </button>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 12, fontSize: 12, color: C.muted }}>
          <Info size={13} />
          <span>
            {rangeProblem ? null : `${days} day${days === 1 ? "" : "s"} selected · `}
            Up to {MAX_DAYS} days at a time. Pay figures follow the 25th–24th pay cycle.
          </span>
        </div>
        {rangeProblem ? <Notice tone="danger">{rangeProblem}</Notice> : null}
        {peopleError ? <Notice tone="warn">{peopleError}</Notice> : null}
        {changed && !rangeProblem ? (
          <Notice tone="warn">The filters have changed. Press Generate Reports to update the results below.</Notice>
        ) : null}
      </section>

      {/* ---- Scope + All-in-One ---- */}
      <section
        style={{
          ...card,
          padding: "14px 20px",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          background: asked ? C.surface : C.subtle,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Showing</div>
          <div style={{ fontSize: 15, color: C.ink, fontWeight: 700 }}>
            {asked ? (
              <>
                {asked.scope}
                <span style={{ color: C.faint, fontWeight: 500 }}> · </span>
                {periodLabel(asked.from, asked.to)}
                <span style={{ color: C.muted, fontWeight: 500, fontSize: 13 }}> ({spanDays(asked.from, asked.to)} days)</span>
              </>
            ) : (
              <span style={{ color: C.muted, fontWeight: 500 }}>Nothing yet. Choose the filters above and press Generate Reports.</span>
            )}
          </div>
        </div>
        <button
          type="button"
          style={primaryBtn(!!asked && allReady && downloading == null)}
          disabled={!asked || !allReady || downloading != null}
          onClick={() => void download("all")}
          title="One Excel workbook: a Summary sheet plus one sheet per report"
        >
          {downloading === "all" ? <Loader2 size={16} className="reportsSpin" /> : <FileSpreadsheet size={16} />}
          {downloading === "all" ? "Preparing…" : "Download All-in-One Report"}
        </button>
      </section>
      {downloadError ? <Notice tone="danger">{downloadError}</Notice> : null}

      {/* ---- Report picker ---- */}
      <nav
        aria-label="Reports"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}
      >
        {REPORTS.map(({ key, Icon, tint, color }) => {
          const selected = tab === key;
          const load = loads[key];
          const figure = headline(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={selected}
              style={{
                ...card,
                font: "inherit",
                textAlign: "left",
                padding: 16,
                minHeight: 0,
                height: "auto",
                cursor: "pointer",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                borderColor: selected ? C.brand : C.line,
                boxShadow: selected ? `0 0 0 3px ${C.brandTint}` : card.boxShadow,
                background: C.surface,
                color: C.body,
              }}
            >
              <span style={{ width: 40, height: 40, borderRadius: 10, background: tint, display: "grid", placeItems: "center", flex: "none" }}>
                <Icon size={20} strokeWidth={2} color={color} />
              </span>
              <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{REPORT_TITLES[key]}</span>
                {load.state === "loading" ? (
                  <span style={{ fontSize: 13, color: C.muted, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Loader2 size={13} className="reportsSpin" /> Loading…
                  </span>
                ) : load.state === "error" ? (
                  <span style={{ fontSize: 13, color: C.danger, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <AlertCircle size={13} /> Could not load
                  </span>
                ) : figure ? (
                  <>
                    <span style={{ fontSize: 18, fontWeight: 800, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{figure.value}</span>
                    <span style={{ fontSize: 12, color: C.muted }}>{figure.caption}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: C.faint }}>Not generated yet</span>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ---- The selected report ---- */}
      <section style={{ ...card, padding: 0, overflow: "hidden" }} aria-label={REPORT_TITLES[tab]}>
        <header
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${C.line}`,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.ink }}>{REPORT_TITLES[tab]}</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>
              {meta.hint} <span style={{ color: C.faint }}>Source: {meta.source}.</span>
            </p>
          </div>
          <button
            type="button"
            style={secondaryBtn(active.state === "ready" && downloading == null)}
            disabled={active.state !== "ready" || downloading != null}
            onClick={() => void download(tab)}
          >
            {downloading === tab ? <Loader2 size={16} className="reportsSpin" /> : <Download size={16} />}
            {downloading === tab ? "Preparing…" : "Download Excel"}
          </button>
        </header>

        <div style={{ padding: 20, minWidth: 0 }}>
          {!asked ? (
            <Empty title="No report generated yet">
              Choose an employee (or all employees) and a period, then press <b>Generate Reports</b>.
            </Empty>
          ) : (
            <LoadView load={active}>
              {tab === "petrol" && petrol.state === "ready" ? (
                petrol.data.length === 0 ? (
                  <Empty title="Nothing to show">
                    {asked.people.every((p) => !p.engineer)
                      ? "The petrol report covers field engineers only, and none is selected."
                      : "None of the selected field engineers logged in during this period."}
                  </Empty>
                ) : (
                  <DaySummarySheet columns={petrol.data} testId="reports-petrol-sheet" />
                )
              ) : null}
              {tab === "productivity" && productivity.state === "ready" ? (
                <ProductivityTable rows={productivity.data} officeStaff={asked.people.every((p) => !p.engineer)} />
              ) : null}
              {tab === "attendance" && attendance.state === "ready" ? <AttendanceTable report={attendance.data} /> : null}
              {tab === "pay" && pay.state === "ready" ? <PayTable slips={pay.data} /> : null}
            </LoadView>
          )}
        </div>
      </section>
    </div>
  );
}

// ---- pieces -----------------------------------------------------------------

function Notice({ tone, children }: { tone: "danger" | "warn"; children: ReactNode }) {
  const danger = tone === "danger";
  return (
    <div
      role={danger ? "alert" : "status"}
      style={{
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 8,
        fontSize: 13,
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        background: danger ? C.dangerTint : C.warnTint,
        color: danger ? C.danger : C.warn,
        border: `1px solid ${danger ? "#fecaca" : "#fde68a"}`,
      }}
    >
      <AlertCircle size={15} style={{ flex: "none", marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ padding: "40px 16px", textAlign: "center", border: `1px dashed ${C.line}`, borderRadius: 10, background: C.subtle }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.muted }}>{children}</div>
    </div>
  );
}

function LoadView({ load, children }: { load: Load<unknown>; children: ReactNode }) {
  if (load.state === "loading" || load.state === "idle") {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center", color: C.muted, fontSize: 14 }}>
        <Loader2 size={22} className="reportsSpin" color={C.brand} />
        <div style={{ marginTop: 8 }}>Loading report…</div>
      </div>
    );
  }
  if (load.state === "error") {
    return (
      <Notice tone="danger">
        {load.message} The other reports are not affected.
      </Notice>
    );
  }
  return <>{children}</>;
}

const scrollBox: CSSProperties = {
  overflow: "auto",
  maxHeight: "calc(100vh - 300px)",
  minHeight: 160,
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  maxWidth: "100%",
};

function ProductivityTable({ rows, officeStaff }: { rows: ProductivityReportRow[]; officeStaff: boolean }) {
  if (rows.length === 0) {
    return (
      <Empty title="Nothing to show">
        {officeStaff ? "Office staff have no call productivity." : "No engineer activity in this period."}
      </Empty>
    );
  }
  const sum = (k: keyof ProductivityReportRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const counts = ["assigned", "attended", "closed", "partOrdered", "underObservation", "customerPending", "engineerDelay"] as const;
  const heads = ["Assigned", "Attended", "Closed", "Part Ordered", "Under Observation", "Customer Pending", "Engineer Delay"];
  return (
    <div style={scrollBox}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 56 }}>#</th>
            <th style={{ ...th, textAlign: "left" }}>Engineer</th>
            <th style={{ ...th, textAlign: "left" }}>Region</th>
            <th style={{ ...th, textAlign: "right" }}>KM</th>
            {heads.map((h) => <th key={h} style={{ ...th, textAlign: "right" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name}>
              <td style={{ ...td, color: C.faint }}>{i + 1}</td>
              <td style={{ ...tdLeft, fontWeight: 600, color: C.ink }}>{r.name}</td>
              <td style={tdLeft}>{r.region}</td>
              <td style={tdNum}>{r.km == null ? "—" : r.km.toFixed(1)}</td>
              {counts.map((k) => <td key={k} style={tdNum}>{r[k]}</td>)}
            </tr>
          ))}
          <tr>
            <td style={{ ...td, ...totalCell }} />
            <td style={{ ...tdLeft, ...totalCell }}>Total · {rows.length} engineers</td>
            <td style={{ ...td, ...totalCell }} />
            <td style={{ ...tdNum, ...totalCell }}>{sum("km").toFixed(1)}</td>
            {counts.map((k) => <td key={k} style={{ ...tdNum, ...totalCell }}>{num(sum(k))}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AttendanceTable({ report }: { report: AttendanceReport }) {
  if (report.rows.length === 0) return <Empty title="Nothing to show">No attendance records in this period.</Empty>;
  const totals = ["Present", "Sunday", "Holiday", "Leave", "Absent", "Half Day", "Present + Leave", "Hours"];
  const clock = (v: string) => new Date(v).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 12, fontSize: 12, color: C.muted, alignItems: "center" }}>
        {LEGEND.map((key) => {
          const tone = STATUS_SHORT[key]!;
          return (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ minWidth: 22, textAlign: "center", padding: "1px 5px", borderRadius: 5, background: tone.bg, color: tone.color, fontWeight: 700 }}>
                {tone.text}
              </span>
              {tone.label}
            </span>
          );
        })}
        <span style={{ marginLeft: "auto", color: C.faint }}>Hover over a day for login and logout times.</span>
      </div>
      <div style={scrollBox}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...th, left: 0, zIndex: 3, width: 44, minWidth: 44 }}>#</th>
              <th style={{ ...th, left: 44, zIndex: 3, textAlign: "left", minWidth: 190, borderRight: `1px solid ${C.line}` }}>Employee</th>
              {report.dates.map((d) => (
                <th key={d} style={{ ...th, minWidth: 42, padding: "6px 4px" }} title={longDate(d)}>
                  <div style={{ fontSize: 13, color: C.ink }}>{d.slice(8, 10)}</div>
                  <div style={{ fontWeight: 500, fontSize: 10 }}>
                    {new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
                  </div>
                </th>
              ))}
              {totals.map((h, i) => (
                <th key={h} style={{ ...th, background: C.brandTint, color: C.brandDark, borderLeft: i === 0 ? `1px solid ${C.line}` : undefined }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={`${row.employeeId ?? row.name}`}>
                <td style={{ ...td, position: "sticky", left: 0, zIndex: 1, color: C.faint }}>{row.sno}</td>
                <td style={{ ...tdLeft, position: "sticky", left: 44, zIndex: 1, borderRight: `1px solid ${C.line}` }}>
                  <div style={{ fontWeight: 600, color: C.ink }}>
                    {row.name}
                    {row.relieved ? (
                      <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: C.danger, background: C.dangerTint, padding: "1px 6px", borderRadius: 999 }}>
                        Relieved
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>{row.branch}</div>
                </td>
                {report.dates.map((d) => {
                  const entry = row.days[d];
                  if (!entry) return <td key={d} style={{ ...td, color: C.faint, padding: "6px 4px" }}>–</td>;
                  const shown = statusShown(entry.status, d);
                  const tone = STATUS_SHORT[shown];
                  const times = [
                    entry.intime ? `In ${clock(entry.intime)}` : "",
                    entry.outtime ? `Out ${clock(entry.outtime)}${entry.autoClosed ? " (auto)" : ""}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <td key={d} style={{ ...td, padding: "6px 4px" }} title={`${longDate(d)} · ${tone?.label ?? shown}${times ? ` · ${times}` : ""}`}>
                      <span
                        style={{
                          display: "inline-block",
                          minWidth: 26,
                          padding: "3px 4px",
                          borderRadius: 6,
                          fontWeight: 700,
                          fontSize: 11,
                          background: tone?.bg ?? C.lineSoft,
                          color: tone?.color ?? C.ink,
                        }}
                      >
                        {tone?.text ?? shown}
                      </span>
                    </td>
                  );
                })}
                {[row.present, row.sunday, row.holiday, row.leave, row.absent, row.halfDay, row.presentPlusLeave].map((n, i) => (
                  <td key={i} style={{ ...tdNum, textAlign: "center", fontWeight: 700, color: C.ink, borderLeft: i === 0 ? `1px solid ${C.line}` : undefined }}>
                    {n}
                  </td>
                ))}
                <td style={{ ...td, fontWeight: 600 }}>{row.hoursText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12, color: C.faint }}>
        The Excel file shows each day with its login and logout times.
      </p>
    </>
  );
}

function PayTable({ slips }: { slips: PayslipRow[] }) {
  if (slips.length === 0) {
    return <Empty title="Nothing to show">No payslips have been generated for the pay months in this period.</Empty>;
  }
  const totals = payTotals(slips);
  const cols: Array<{ key: string; label: string; kind: "days" | "money" }> = [
    { key: "total_days", label: "Total Days", kind: "days" },
    { key: "paid_days", label: "Paid Days", kind: "days" },
    { key: "lop_days", label: "LOP Days", kind: "days" },
    { key: "gross_salary", label: "Gross Salary", kind: "money" },
    { key: "gross_earnings", label: "Earned", kind: "money" },
    { key: "gross_deductions", label: "Deductions", kind: "money" },
    { key: PAY_NET.key, label: "Net Pay", kind: "money" },
  ];
  const cell = (kind: "days" | "money", v: unknown) => (kind === "money" ? `₹${formatMoney(v)}` : formatDays(v));
  return (
    <>
      <div style={scrollBox}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 44 }}>#</th>
              <th style={{ ...th, textAlign: "left" }}>Employee</th>
              <th style={th}>Pay Month</th>
              <th style={th}>Status</th>
              {cols.map((c) => (
                <th key={c.key} style={{ ...th, textAlign: "right", ...(c.key === PAY_NET.key ? { color: C.brandDark, background: C.brandTint } : {}) }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slips.map((s, i) => {
              const emp = s.employee_details ?? {};
              const paid = s.status === "Paid";
              return (
                <tr key={s.id}>
                  <td style={{ ...td, color: C.faint }}>{i + 1}</td>
                  <td style={tdLeft}>
                    <div style={{ fontWeight: 600, color: C.ink }}>
                      {emp.employee_name || "—"}
                      {emp.status === "relieved" ? (
                        <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: C.danger, background: C.dangerTint, padding: "1px 6px", borderRadius: 999 }}>
                          Relieved
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {emp.emp_code || "—"} · {emp.branch || "Not assigned"}
                    </div>
                  </td>
                  <td style={td}>{payPeriod(s)}</td>
                  <td style={td}>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: paid ? "#e0f2fe" : "#dcfce7",
                        color: paid ? "#075985" : "#166534",
                      }}
                    >
                      {s.status || "—"}
                    </span>
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      style={{ ...tdNum, ...(c.key === PAY_NET.key ? { fontWeight: 700, color: C.ink, background: "#fafaff" } : {}) }}
                    >
                      {cell(c.kind, s[c.key])}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <td style={{ ...td, ...totalCell }} />
              <td style={{ ...tdLeft, ...totalCell }}>Total · {slips.length} payslips</td>
              <td style={{ ...td, ...totalCell }} />
              <td style={{ ...td, ...totalCell }} />
              {cols.map((c) => (
                <td key={c.key} style={{ ...tdNum, ...totalCell }}>{cell(c.kind, totals[c.key])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12, color: C.faint }}>
        Key figures are shown here. The Excel file has every column of Payroll&apos;s Employee Pay Report: days, gross, earned, deductions and employer contributions.
      </p>
    </>
  );
}
