import { WEB_API_BASE_URL } from "./api/webApiClient";

export type UserRole = "SUPER_ADMIN" | "REGION_ADMIN";

export interface AdminRegion {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface ManagedUser {
  id: string;
  email: string;
  username: string | null;
  role: UserRole;
  regionId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  deactivatedAt: string | null;
  deactivatedBy: string | null;
}

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: { data?: T; error?: { message?: string; details?: unknown } } | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body?.error?.message ?? `Request failed ${response.status}`;
    throw new Error(message);
  }
  if (!body || body.data === undefined) {
    throw new Error("Unexpected API response");
  }
  return body.data;
}

export async function listAdminRegions(token: string): Promise<AdminRegion[]> {
  const response = await fetch(url("/api/v1/admin/regions"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<AdminRegion[]>(response);
}

export interface ListAdminUsersFilters {
  role?: UserRole;
  regionId?: string;
  isActive?: boolean;
  q?: string;
}

export async function listAdminUsers(
  token: string,
  filters: ListAdminUsersFilters = {},
): Promise<ManagedUser[]> {
  const params = new URLSearchParams();
  if (filters.role) params.set("role", filters.role);
  if (filters.regionId) params.set("regionId", filters.regionId);
  if (typeof filters.isActive === "boolean") {
    params.set("isActive", String(filters.isActive));
  }
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  const response = await fetch(
    url(`/api/v1/admin/users${qs ? `?${qs}` : ""}`),
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<ManagedUser[]>(response);
}

export async function getAdminUser(
  token: string,
  userId: string,
): Promise<ManagedUser> {
  const response = await fetch(url(`/api/v1/admin/users/${userId}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<ManagedUser>(response);
}

export interface CreateAdminUserInput {
  email: string;
  username: string;
  password: string;
  role: UserRole;
  regionId: string | null;
  mustChangePassword?: boolean;
}

export async function createAdminUser(
  token: string,
  input: CreateAdminUserInput,
): Promise<ManagedUser> {
  const response = await fetch(url("/api/v1/admin/users"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<ManagedUser>(response);
}

export interface UpdateAdminUserProfileInput {
  email?: string;
  username?: string;
}

export async function updateAdminUserProfile(
  token: string,
  userId: string,
  input: UpdateAdminUserProfileInput,
): Promise<ManagedUser> {
  const response = await fetch(url(`/api/v1/admin/users/${userId}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<ManagedUser>(response);
}

export interface ChangeAdminUserRoleInput {
  role: UserRole;
  regionId: string | null;
}

export async function changeAdminUserRole(
  token: string,
  userId: string,
  input: ChangeAdminUserRoleInput,
): Promise<ManagedUser> {
  const response = await fetch(url(`/api/v1/admin/users/${userId}/role`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<ManagedUser>(response);
}

export async function reassignAdminUserRegion(
  token: string,
  userId: string,
  regionId: string | null,
): Promise<ManagedUser> {
  const response = await fetch(url(`/api/v1/admin/users/${userId}/region`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ regionId }),
  });
  return readJson<ManagedUser>(response);
}

export interface AdminPasswordResetInput {
  newPassword: string;
  requireChangeOnNextLogin?: boolean;
}

export async function adminPasswordReset(
  token: string,
  userId: string,
  input: AdminPasswordResetInput,
): Promise<ManagedUser> {
  const response = await fetch(
    url(`/api/v1/admin/users/${userId}/password-reset`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        password: input.newPassword,
        requireChange: input.requireChangeOnNextLogin ?? true,
      }),
    },
  );
  return readJson<ManagedUser>(response);
}

export async function deactivateAdminUser(
  token: string,
  userId: string,
): Promise<ManagedUser> {
  const response = await fetch(
    url(`/api/v1/admin/users/${userId}/deactivate`),
    {
      method: "POST",
      headers: authHeaders(token),
    },
  );
  return readJson<ManagedUser>(response);
}

export async function reactivateAdminUser(
  token: string,
  userId: string,
): Promise<ManagedUser> {
  const response = await fetch(
    url(`/api/v1/admin/users/${userId}/reactivate`),
    {
      method: "POST",
      headers: authHeaders(token),
    },
  );
  return readJson<ManagedUser>(response);
}

export interface ChangeOwnPasswordInput {
  currentPassword: string;
  newPassword: string;
}

export async function changeOwnPassword(
  token: string,
  input: ChangeOwnPasswordInput,
): Promise<{ ok: true }> {
  const response = await fetch(url("/api/v1/me/password"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<{ ok: true }>(response);
}
