// Engineer-productivity classification and the day-scoped calculation now live
// in @opencall/shared — the SAME implementation the backend Final-EOD freeze
// runs, so live and frozen numbers can never diverge. This module only
// re-exports; no behavior fork.
//
// Day-scoped model (see the shared module for the full story):
//   Assigned = the day's PLAN: calls whose Morning status is EXACTLY
//              "Scheduled" with an engineer set — the booked set. Pre-booking
//              states (To be Scheduled / Engg Assigned) and carried backlog
//              (worked today or not) are out.
//   Attended = outcomes from the Evening (today) status or a same-day closure
//              ONLY — and only for calls in the plan.
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
