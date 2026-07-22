"use client";

import { createContext, useContext } from "react";
import type { ClientSession } from "../../lib/session";

/** Session plumbing for the mobile shell. */
export interface MobileSessionValue {
  session: ClientSession | null;
  signOut: () => void;
  refreshSession: () => void;
}

export const MobileSessionContext = createContext<MobileSessionValue>({
  session: null,
  signOut: () => {},
  refreshSession: () => {},
});

export function useMobileSession(): MobileSessionValue {
  return useContext(MobileSessionContext);
}

/**
 * Whether this session may see an operational section — the same rules the web app
 * applies, so the app can never show more than the web does:
 *   - special access: only its granted `sections`
 *   - REGION_ADMIN:   its `accessibleSections` (null/absent = all)
 *   - SUPER_ADMIN:    everything
 */
export function canSeeMobileSection(
  session: ClientSession | null,
  key: string,
): boolean {
  if (!session) return false;
  const user = session.user;

  if (user.role === "SPECIAL_ACCESS") {
    return user.specialAccess?.sections?.includes(key) ?? false;
  }
  const scoped = user.accessibleSections ?? null;
  return scoped === null || scoped.includes(key);
}

/** Sections only a SUPER_ADMIN reaches (mirrors the web sidebar). */
export function isSuperAdminSession(session: ClientSession | null): boolean {
  return session?.user.role === "SUPER_ADMIN";
}
