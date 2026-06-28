/**
 * Shared utility functions used across modules.
 * Pure functions only — no side effects, no imports.
 */

/** Zero-pads a number to 2 digits. */
export function pad(n) {
  return String(n).padStart(2, "0");
}

/** Returns the ISO date string (YYYY-MM-DD) for a Date object. */
export function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses an ISO date string (YYYY-MM-DD) into a local midnight Date. */
export function localDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Escapes HTML special characters to prevent XSS in innerHTML. */
export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Truncates a string and appends "…" when it exceeds maxLength. */
export function truncate(str, maxLength) {
  if (!str || str.length <= maxLength) return str ?? "";
  return str.slice(0, maxLength - 1) + "…";
}

/** Returns the ISO date string for today. */
export function isoToday() {
  return isoDate(new Date());
}

/** Returns the Monday of the week containing the given date (time set to 00:00:00). */
export function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}
