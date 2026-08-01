import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/**
 * Engineer Target client. Types are declared here rather than imported from
 * `@opencall/shared` because the frontend's copy of that package does not carry them —
 * same approach as `partsCatalogApiClient` and `renewalApiClient`. Self-contained: no
 * existing client module is changed.
 */

export interface EngineerDayClose {
  date: string;
  closed: number;
}

export interface EngineerTargetRow {
  engineer: string;
  regionCode: string;
  todayClosed: number;
  periodClosed: number;
  daysWorked: number;
  days: EngineerDayClose[];
}

export interface EngineerTargetResponse {
  fromDate: string;
  toDate: string;
  latestDate: string | null;
  reportDays: number;
  dailyTarget: number;
  monthlyTarget: number;
  workingDaysPerMonth: number;
  rows: EngineerTargetRow[];
}

export async function getEngineerTarget(
  token: string,
  params: { from: string; to: string },
): Promise<EngineerTargetResponse> {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/engineer-target?${qs.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  return readJson<EngineerTargetResponse>(response);
}
