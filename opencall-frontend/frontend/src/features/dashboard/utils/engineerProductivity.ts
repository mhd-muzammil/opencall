// Engineer-productivity classification and the day-scoped calculation now live
// in @opencall/shared — the SAME implementation the backend Final-EOD freeze
// runs, so live and frozen numbers can never diverge. This module only
// re-exports; no behavior fork.
//
// Day-scoped model (see the shared module for the full story):
//   Assigned = the day's PLAN: still-Scheduled calls (with an engineer) plus
//              calls actually worked today. Untouched carried backlog is out.
//   Attended = outcomes from the Evening (today) status or a same-day closure
//              ONLY — the carried Morning status never feeds an outcome.
export {
  addToProductivityCounts,
  canonicalEngineerName,
  classifyProductivityStatus,
  computeEngineerProductivity,
  emptyProductivityBucketCounts,
  eveningProductivityStatus,
  isProductivityVisibleRow,
  mergeEngineerProductivityResults,
  morningProductivityStatus,
  resolveDayScopedProductivityBucket,
  type ComputeEngineerProductivityOptions,
  type EngineerProductivityEntry,
  type EngineerProductivityResult,
  type ProductivityBucket,
  type ProductivityBucketCounts,
  type ProductivityReportRow,
} from "@opencall/shared";
