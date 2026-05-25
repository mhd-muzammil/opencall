export type UserRole = "SUPER_ADMIN" | "REGION_ADMIN";

export interface ClientSessionUser {
  id: string;
  email: string;
  username: string | null;
  role: UserRole;
  regionId: string | null;
  mustChangePassword?: boolean;
}

export interface ClientSession {
  token: string;
  user: ClientSessionUser;
}

const TOKEN_KEY = "opencall.token";
const USER_KEY = "opencall.user";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSession(): ClientSession | null {
  const storage = safeStorage();
  if (!storage) return null;
  const token = storage.getItem(TOKEN_KEY);
  const userRaw = storage.getItem(USER_KEY);
  if (!token || !userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as ClientSessionUser;
    if (!user || typeof user.id !== "string" || typeof user.role !== "string") {
      return null;
    }
    return { token, user };
  } catch {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(USER_KEY);
    return null;
  }
}

export function writeSession(session: ClientSession): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(TOKEN_KEY, session.token);
  storage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession(): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(TOKEN_KEY);
  storage.removeItem(USER_KEY);
}
