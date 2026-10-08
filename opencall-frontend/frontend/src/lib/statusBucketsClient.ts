"use client";

import { useSyncExternalStore } from "react";
import {
  getStatusBucketVersion,
  setCustomBodEodRows,
  setStatusBucketMap,
  subscribeStatusBuckets,
} from "@opencall/shared";
import type { RtplStatusesDropdownResponse } from "./api/types";

/**
 * Load the admin's status -> BOD/EOD row choices that came back with the RTPL
 * status dropdown into the shared classifier. Every screen that polls the
 * dropdown calls this, so an edit on the RTPL Statuses page reaches the
 * dashboards on the next poll without a reload.
 */
export function applyStatusBuckets(response: RtplStatusesDropdownResponse): void {
  // An older backend sends no `buckets`: leave the mapping as it is rather than
  // clearing it.
  // Rows first: a status on a custom row needs it to count anywhere.
  if (response.rows) setCustomBodEodRows(response.rows);
  if (response.buckets) setStatusBucketMap(response.buckets);
}

/**
 * Changes whenever the mapping does. Put it in the dependencies of any memo that
 * groups rows by status, so the numbers recompute when an admin moves a status.
 */
export function useStatusBucketVersion(): number {
  return useSyncExternalStore(
    subscribeStatusBuckets,
    getStatusBucketVersion,
    getStatusBucketVersion,
  );
}
