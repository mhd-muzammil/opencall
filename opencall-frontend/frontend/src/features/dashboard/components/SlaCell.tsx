import { useLiveNow } from "../../../lib/liveClock";
import type { FieldezSlaRow } from "../../../lib/fieldezSlaApiClient";

/**
 * A call's SLA, under its work order, counting down as you watch.
 *
 * Two things it has to get right that the first version did not.
 *
 * IT TICKS. A countdown that only moves when the page reloads is a photograph of a
 * countdown. The seconds run here, off one shared clock — nine hundred rows cannot each
 * carry a timer, and re-rendering the whole report every second for a few dozen characters
 * is worse.
 *
 * IT SAYS WHEN. "over 29h" answers how late without answering late for what; the deadline
 * itself is what somebody quotes back to HP, and it is what makes the countdown checkable
 * rather than something to be taken on trust.
 *
 * ON ITS OWN LINE. Both of those beside the work order pushed the Case ID column off the
 * screen. A second line costs a few pixels of row height and nothing else.
 *
 * PRECISION FOLLOWS URGENCY. Seconds inside a day, where somebody is actually watching the
 * clock; minutes beyond it, where a ticking seconds counter is noise on a deadline five days
 * out. Nothing is shown at all for a call FieldEZ records no SLA on — a blank is honest
 * where a zero would not be.
 */

interface SlaCellProps {
  sla: FieldezSlaRow | undefined;
}

const HOUR = 3600;
const DAY = 86400;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * "45m 12s" inside the hour, "1h 15m" beyond it, "5d 3h 12m" beyond a day.
 *
 * Seconds only inside the last hour. They tick, which is the point — but they also cost four
 * characters, and the countdown and the deadline together have to fit a table cell beside
 * the work order. Written at every range, "over 1h 15m 32s · 26 Aug, 5:39 pm" ran off the
 * end of the column and over the Case ID beside it. An hour out is where somebody is
 * genuinely watching the clock; further out, a seconds counter is spending width on noise.
 */
export function formatCountdown(seconds: number): string {
  const total = Math.abs(seconds);
  if (total >= DAY) {
    const days = Math.floor(total / DAY);
    const hours = Math.floor((total % DAY) / HOUR);
    const minutes = Math.floor((total % HOUR) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }
  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / 60);
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  return `${minutes}m ${pad(total % 60)}s`;
}

/** "26 Aug 5:39 pm" in the time everybody here works in. */
export function formatDeadline(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    // The comma en-IN puts between the date and the time buys nothing and costs width in a
    // cell that has none to spare.
    .replace(",", "");
}

export function SlaCell({ sla }: Readonly<SlaCellProps>) {
  // Subscribed unconditionally: a hook cannot sit behind the early return below, and the
  // shared clock costs nothing extra per subscriber.
  const now = useLiveNow();

  if (!sla) return null;

  const end = sla.slaEndTime ? new Date(sla.slaEndTime).getTime() : Number.NaN;
  const hasDeadline = !Number.isNaN(end);
  const breachedByWords = /breach/i.test(sla.slaStatus);

  // Nothing to say: no deadline recorded and no status either. Rendering a chip here would
  // invent an SLA for a call FieldEZ makes no promise about.
  if (!hasDeadline && !breachedByWords && !/within/i.test(sla.slaStatus)) return null;

  const secondsLeft = hasDeadline ? Math.round((end - now) / 1000) : null;
  const breached = secondsLeft !== null ? secondsLeft < 0 : breachedByWords;
  const soon = !breached && secondsLeft !== null && secondsLeft <= 4 * HOUR;

  const colours = breached
    ? { border: "#fecaca", bg: "#fef2f2", fg: "#b91c1c" }
    : soon
      ? { border: "#fed7aa", bg: "#fff7ed", fg: "#c2410c" }
      : { border: "#bbf7d0", bg: "#f0fdf4", fg: "#15803d" };

  const countdown =
    secondsLeft === null
      ? sla.slaStatus
      : `${breached ? "over " : ""}${formatCountdown(secondsLeft)}`;

  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginTop: 3,
        whiteSpace: "nowrap",
        // A table cell does not clip what overflows it, so without these the date simply
        // drew itself on top of the Case ID column next door. Shorter text is what makes it
        // fit; this is what guarantees it can never spill again if it stops fitting.
        maxWidth: "100%",
        overflow: "hidden",
      }}
      title={
        `SLA ${sla.slaStatus || (breached ? "breached" : "within")}` +
        (sla.slaPolicy ? ` · ${sla.slaPolicy}` : "") +
        " · from FieldEZ"
      }
    >
      <span
        style={{
          padding: "0 6px",
          borderRadius: 999,
          border: `1px solid ${colours.border}`,
          background: colours.bg,
          color: colours.fg,
          fontSize: 10.5,
          fontWeight: 700,
          lineHeight: "16px",
          // Tabular figures, so a ticking countdown does not jitter the row width every
          // second as digits of different widths go past.
          fontVariantNumeric: "tabular-nums",
        }}
      >
        ⏱ {countdown}
      </span>
      {sla.slaEndTime ? (
        <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 500 }}>
          {formatDeadline(sla.slaEndTime)}
        </span>
      ) : null}
    </span>
  );
}
