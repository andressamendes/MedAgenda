/**
 * Cross-verification: confirms the Edge Function's notification check
 * (expandEvent(event, today, today).length > 0) produces the same results
 * as the full calendar expansion.
 *
 * Run with: node --experimental-vm-modules tests/recurrence-notification.test.js
 */

import { expandEvent } from "../recurrence.js";

let passed = 0;
let failed = 0;

function assert(description, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${description}`);
  } else {
    failed++;
    console.error(`  ✗ ${description}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

/**
 * Builds the set of occurrence dates by full expansion, then verifies that
 * checking each date individually (the notification path) matches.
 */
function verifyNotificationConsistency(label, event, rangeStart, rangeEnd) {
  const allDates = expandEvent(event, rangeStart, rangeEnd).map(o => o.event_date);
  const dateSet  = new Set(allDates);

  // Walk every calendar day in the range and check point-in-time
  let cur  = new Date(...rangeStart.split("-").map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
  const end = new Date(...rangeEnd.split("-").map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
  const mismatches = [];

  while (cur <= end) {
    const d   = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    const pit = expandEvent(event, d, d).length > 0; // point-in-time check (notification path)
    const exp = dateSet.has(d);                       // full-expansion answer
    if (pit !== exp) mismatches.push(d);
    cur.setDate(cur.getDate() + 1);
  }

  assert(`${label}: point-in-time matches full expansion`, mismatches, []);
}

function makeEvent(overrides = {}) {
  return {
    id:                      "evt-x",
    title:                   "Test",
    event_date:              "2024-01-01",
    start_time:              "09:00",
    recurrence_type:         "none",
    recurrence_interval:     null,
    recurrence_until:        null,
    recurrence_days_of_week: null,
    ...overrides,
  };
}

console.log("\nnone");
verifyNotificationConsistency(
  "single event",
  makeEvent({ event_date: "2024-03-15" }),
  "2024-03-01", "2024-03-31"
);

console.log("\ndaily");
verifyNotificationConsistency(
  "daily, interval=1",
  makeEvent({ recurrence_type: "daily", recurrence_until: "2024-01-20" }),
  "2024-01-01", "2024-01-25"
);
verifyNotificationConsistency(
  "daily, interval=3 (every 3 days)",
  makeEvent({ recurrence_type: "daily", recurrence_interval: 3, recurrence_until: "2024-02-15" }),
  "2024-01-01", "2024-02-20"
);

console.log("\nweekdays");
verifyNotificationConsistency(
  "weekdays",
  makeEvent({ recurrence_type: "weekdays", recurrence_until: "2024-01-31" }),
  "2024-01-01", "2024-01-31"
);

console.log("\nweekly");
verifyNotificationConsistency(
  "weekly, interval=1",
  makeEvent({ recurrence_type: "weekly", recurrence_until: "2024-03-01" }),
  "2024-01-01", "2024-03-05"
);
verifyNotificationConsistency(
  "weekly, interval=2 (every 2 weeks)",
  makeEvent({ recurrence_type: "weekly", recurrence_interval: 2, recurrence_until: "2024-03-01" }),
  "2024-01-01", "2024-03-05"
);
verifyNotificationConsistency(
  "weekly, interval=3 (every 3 weeks)",
  makeEvent({ recurrence_type: "weekly", recurrence_interval: 3, recurrence_until: "2024-04-01" }),
  "2024-01-01", "2024-04-05"
);

console.log("\nbiweekly");
verifyNotificationConsistency(
  "biweekly",
  makeEvent({ recurrence_type: "biweekly", recurrence_until: "2024-04-01" }),
  "2024-01-01", "2024-04-05"
);

console.log("\nmonthly");
verifyNotificationConsistency(
  "monthly, interval=1",
  makeEvent({ recurrence_type: "monthly", recurrence_until: "2024-12-31" }),
  "2024-01-01", "2024-12-31"
);
verifyNotificationConsistency(
  "monthly, interval=2 (every 2 months)",
  makeEvent({ recurrence_type: "monthly", recurrence_interval: 2, recurrence_until: "2024-12-31" }),
  "2024-01-01", "2024-12-31"
);
verifyNotificationConsistency(
  "monthly, interval=3 (quarterly)",
  makeEvent({ recurrence_type: "monthly", recurrence_interval: 3, recurrence_until: "2025-06-30" }),
  "2024-01-01", "2025-06-30"
);

console.log("\nyearly");
verifyNotificationConsistency(
  "yearly, interval=1",
  makeEvent({ recurrence_type: "yearly", recurrence_until: "2027-12-31" }),
  "2024-01-01", "2027-12-31"
);
verifyNotificationConsistency(
  "yearly, interval=2 (every 2 years)",
  makeEvent({ recurrence_type: "yearly", recurrence_interval: 2, recurrence_until: "2030-12-31" }),
  "2024-01-01", "2030-12-31"
);

console.log("\ncustom");
// 2024-01-01 = Monday
verifyNotificationConsistency(
  "custom every 2 weeks, Mon+Wed",
  makeEvent({
    event_date:              "2024-01-01",
    recurrence_type:         "custom",
    recurrence_interval:     2,
    recurrence_days_of_week: "1,3",
    recurrence_until:        "2024-03-15",
  }),
  "2024-01-01", "2024-03-15"
);
verifyNotificationConsistency(
  "custom every 3 weeks, Mon+Fri",
  makeEvent({
    event_date:              "2024-01-01",
    recurrence_type:         "custom",
    recurrence_interval:     3,
    recurrence_days_of_week: "1,5",
    recurrence_until:        "2024-04-30",
  }),
  "2024-01-01", "2024-04-30"
);
verifyNotificationConsistency(
  "custom every 1 week, Tue+Thu",
  makeEvent({
    event_date:              "2024-01-02", // Tuesday
    recurrence_type:         "custom",
    recurrence_interval:     1,
    recurrence_days_of_week: "2,4",
    recurrence_until:        "2024-02-29",
  }),
  "2024-01-02", "2024-02-29"
);

console.log("\nopen-ended (no until)");
verifyNotificationConsistency(
  "weekly open-ended",
  makeEvent({ recurrence_type: "weekly" }),
  "2024-01-01", "2024-03-01"
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
