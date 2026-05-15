import { calculateWipAging } from "./src/services/compareService/wipAgingCalculator.js";
import { formatDisplayDateTime } from "./src/services/callPlanGenerator/dailyCallPlanFormatter.js";

const d = new Date("2026-02-06T10:23:35+05:30");
console.log("Date:", d);
console.log("calc:", calculateWipAging(d));
console.log("fmt:", formatDisplayDateTime(d.toISOString()));

const d2 = "19-02-2026 12:50:12 PM";
console.log("calc2:", calculateWipAging(d2));
console.log("fmt2:", formatDisplayDateTime(d2));
