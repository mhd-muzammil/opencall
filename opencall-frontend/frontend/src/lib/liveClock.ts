import { useEffect, useState } from "react";

/**
 * One clock, ticking once a second, shared by everything that counts down.
 *
 * A live SLA countdown means the number on screen has to change while somebody watches it,
 * and the obvious way — an interval inside each countdown — puts nine hundred timers on the
 * Open Call Report and re-renders the page around each of them. The other obvious way, one
 * `useState` at the top of the page, re-renders the entire report every second for the sake
 * of a few dozen characters.
 *
 * So: a single module-level interval, and components subscribe. Only the subscribers
 * re-render, and there is exactly one timer however many of them there are.
 *
 * IT STOPS WHEN NOBODY IS WATCHING. The interval starts on the first subscriber and is
 * cleared when the last one goes, so leaving the SLA page does not leave a timer running for
 * the rest of the session.
 */

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) timer = setInterval(tick, 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * The current time, refreshed every second.
 *
 * Seeded inside `useState`'s initialiser rather than as a literal so the first render on the
 * client does not disagree with the server's.
 */
export function useLiveNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribe(() => setNow(Date.now())), []);
  return now;
}
