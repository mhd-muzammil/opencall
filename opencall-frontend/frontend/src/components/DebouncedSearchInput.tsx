"use client";

// Search box that echoes keystrokes instantly in LOCAL state and commits the
// value upward only after a short pause (or immediately on Enter/blur/clear).
//
// Why: the records search used to push every keystroke straight into page-level
// state, re-rendering the whole workspace — including the full records table —
// per key. Typing cost ~0.7s per character on a real report; with the debounce
// the table recomputes once per pause and typing is instant, which is the
// responsiveness the Excel-first team expects.
import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "defaultValue"
>;

export interface DebouncedSearchInputProps extends NativeInputProps {
  /** The committed (page-level) value; external resets sync back down. */
  value: string;
  /** Called with the draft value after the debounce (or Enter/blur/clear). */
  onDebouncedChange: (value: string) => void;
  /** Debounce delay in ms. */
  delay?: number;
}

export function DebouncedSearchInput({
  value,
  onDebouncedChange,
  delay = 250,
  ...inputProps
}: DebouncedSearchInputProps) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(onDebouncedChange);
  commitRef.current = onDebouncedChange;

  // External changes (Clear-All buttons, restores) win over a stale draft.
  // While the user is typing `value` doesn't move, so the draft is never
  // clobbered mid-word; on commit the incoming value equals the draft (no-op).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const commitNow = (next: string) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    commitRef.current(next);
  };

  return (
    <input
      {...inputProps}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
        }
        // An emptied box commits immediately — clearing must feel instant.
        if (next === "") {
          commitNow(next);
          return;
        }
        timerRef.current = setTimeout(() => commitRef.current(next), delay);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commitNow((event.target as HTMLInputElement).value);
        }
        inputProps.onKeyDown?.(event);
      }}
      onBlur={(event) => {
        commitNow(event.target.value);
        inputProps.onBlur?.(event);
      }}
    />
  );
}
