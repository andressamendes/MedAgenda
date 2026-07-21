/**
 * Tests for utils.js
 * Run with: node --experimental-vm-modules tests/utils.test.js
 * Or open tests/index.html in a browser.
 */

import { pad, isoDate, localDate, escapeHtml, isoToday, mondayOf, readableTextColor, formatDuration, formatClockTime } from "../utils.js";

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

function assertTrue(description, value) {
  if (value) {
    passed++;
    console.log(`  ✓ ${description}`);
  } else {
    failed++;
    console.error(`  ✗ ${description} — got falsy`);
  }
}

// ── pad ──────────────────────────────────────────────────────────────────────
console.log("\npad()");
assert("single digit", pad(5), "05");
assert("double digit", pad(12), "12");
assert("zero", pad(0), "00");
assert("string number", pad("3"), "03");

// ── isoDate ──────────────────────────────────────────────────────────────────
console.log("\nisoDate()");
assert("2024-01-05", isoDate(new Date(2024, 0, 5)), "2024-01-05");
assert("2024-12-31", isoDate(new Date(2024, 11, 31)), "2024-12-31");
assert("2025-03-09", isoDate(new Date(2025, 2, 9)), "2025-03-09");

// ── localDate ────────────────────────────────────────────────────────────────
console.log("\nlocalDate()");
const d1 = localDate("2024-03-15");
assert("year", d1.getFullYear(), 2024);
assert("month (0-indexed)", d1.getMonth(), 2);
assert("day", d1.getDate(), 15);
assert("roundtrip via isoDate", isoDate(localDate("2025-07-04")), "2025-07-04");

// ── escapeHtml ───────────────────────────────────────────────────────────────
console.log("\nescapeHtml()");
assert("ampersand", escapeHtml("a & b"), "a &amp; b");
assert("less than", escapeHtml("<script>"), "&lt;script&gt;");
assert("quotes", escapeHtml('"quoted"'), "&quot;quoted&quot;");
assert("no special chars", escapeHtml("Hello"), "Hello");
assert("null input", escapeHtml(null), "");
assert("undefined input", escapeHtml(undefined), "");
assert("number input", escapeHtml(42), "42");
assert("combined", escapeHtml('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');

// ── isoToday ─────────────────────────────────────────────────────────────────
console.log("\nisoToday()");
const today = isoToday();
assertTrue("returns a string", typeof today === "string");
assertTrue("matches YYYY-MM-DD pattern", /^\d{4}-\d{2}-\d{2}$/.test(today));
assert("matches isoDate(new Date())", today, isoDate(new Date()));

// ── mondayOf ─────────────────────────────────────────────────────────────────
console.log("\nmondayOf()");
// 2024-03-13 is a Wednesday
assert("Wednesday → Monday", isoDate(mondayOf(new Date(2024, 2, 13))), "2024-03-11");
// 2024-03-11 is a Monday
assert("Monday → same Monday", isoDate(mondayOf(new Date(2024, 2, 11))), "2024-03-11");
// 2024-03-17 is a Sunday
assert("Sunday → previous Monday", isoDate(mondayOf(new Date(2024, 2, 17))), "2024-03-11");
// 2024-03-16 is a Saturday
assert("Saturday → previous Monday", isoDate(mondayOf(new Date(2024, 2, 16))), "2024-03-11");

// ── readableTextColor (F11 E18, auditoria #21) ──────────────────────────────
console.log("\nreadableTextColor()");
assert("very dark background → white text", readableTextColor("#1a1a1a"), "#fff");
assert("very light background → dark text", readableTextColor("#fef9c3"), "#1f2937");
assert("white background → dark text", readableTextColor("#ffffff"), "#1f2937");
assert("black background → white text", readableTextColor("#000000"), "#fff");
assert("mid-tone blue (default category color) → white text", readableTextColor("#3b82f6"), "#fff");
assert("without leading #", readableTextColor("fef9c3"), "#1f2937");
assert("missing color falls back to white", readableTextColor(null), "#fff");
assert("empty string falls back to white", readableTextColor(""), "#fff");
assert("malformed hex falls back to white", readableTextColor("not-a-color"), "#fff");

// ── formatDuration (F15.16) ─────────────────────────────────────────────────
console.log("\nformatDuration()");
assert("under an hour", formatDuration(42), "42min");
assert("zero minutes", formatDuration(0), "0min");
assert("exact hour keeps the minutes", formatDuration(60), "1h 0min");
assert("hours and minutes", formatDuration(125), "2h 5min");
assert("null → unknown", formatDuration(null), "—");
assert("undefined → unknown", formatDuration(undefined), "—");
assert("negative clamps to zero", formatDuration(-10), "0min");
assert("rounds fractional minutes", formatDuration(90.6), "1h 31min");

// ── formatClockTime (F15.16) ────────────────────────────────────────────────
console.log("\nformatClockTime()");
assert("formats HH:MM", formatClockTime("2026-07-21T09:05:00"), "09:05");
assert("pads single-digit hour and minute", formatClockTime("2026-07-21T01:02:00"), "01:02");
assert("missing iso → unknown", formatClockTime(null), "—");
assert("empty string → unknown", formatClockTime(""), "—");

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
