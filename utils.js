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

/**
 * Escolhe branco ou cinza-escuro (--gray-800) como cor de texto legível sobre
 * um fundo hex arbitrário (F11 E18, auditoria #21) — cores de categoria são
 * escolhidas livremente pelo usuário (qualquer hex), então nem sempre o
 * branco hardcoded nos chips/badges de evento é legível (ex.: amarelo claro,
 * branco). Fórmula de brilho percebido (YIQ), independente de tema claro ou
 * escuro: a decisão depende só da cor de fundo em si, nunca do tema do app.
 */
export function readableTextColor(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex ?? "").trim());
  if (!m) return "#fff";
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16));
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#1f2937" : "#fff";
}
