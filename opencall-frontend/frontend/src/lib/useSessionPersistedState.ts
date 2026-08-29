import { useEffect, useState } from "react";

/**
 * A string state that survives moving between workspace views, but not closing the tab.
 *
 * The workspace mounts one view at a time (`workspaceView === "closed-calls" && <.../>`),
 * so switching to Open Call Report and back UNMOUNTS the view and every `useState` in it
 * snaps to its default. A date range someone had just set was silently lost on the way to
 * another page and back.
 *
 * `sessionStorage` is the exact lifetime wanted here, and the reason this is not
 * `localStorage`: it is per-tab and dies with the tab, so a filter follows you around the
 * app for as long as you are working, and tomorrow's first visit starts on today again
 * rather than resurrecting a range chosen last week.
 *
 * Every access is wrapped: a private window, blocked site data, or a thumbnailer can make
 * `sessionStorage` throw on read as well as write, and a lost filter must never take the
 * page down with it.
 */
/**
 * The stored value for `key`, or the default when there is none.
 *
 * Exported so the behaviour can be tested without rendering: remounting the view is
 * exactly one more call to this, which is the whole of what "the filter survived
 * navigation" means.
 *
 * A stored empty string is a REAL value — it means an unbounded end of the range — so
 * only a genuinely absent key falls back to the default. `??` rather than `||`.
 */
export function readPersisted(
  key: string,
  initial: string | (() => string),
): string {
  const stored = readSession(key);
  if (stored !== null) return stored;
  return typeof initial === "function" ? initial() : initial;
}

function readSession(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores `value`, swallowing a storage that refuses to be written to. */
export function persist(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable or full — the filter just stops surviving navigation.
  }
}

/**
 * `initial` may be a factory, matching `useState`, so a default that reads the clock is
 * only computed when there is nothing stored.
 *
 * Reading in the lazy initialiser rather than an effect is deliberate: restoring after
 * mount would render one frame of the default first, and every consumer of the range
 * would fire a request for the wrong period before being corrected. It is safe here
 * because the workspace renders only behind a client-side login, so this never runs
 * during server rendering and cannot desync hydration.
 */
export function useSessionPersistedState(
  key: string,
  initial: string | (() => string),
): [string, (value: string) => void] {
  const [value, setValue] = useState<string>(() => readPersisted(key, initial));

  useEffect(() => {
    persist(key, value);
  }, [key, value]);

  return [value, setValue];
}
