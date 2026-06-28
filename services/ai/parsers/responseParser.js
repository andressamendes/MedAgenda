/**
 * responseParser.js — Normalises raw LLM text responses.
 * Strips model artefacts and returns clean, user-facing markdown.
 */

/**
 * @param {string|null} raw - Raw text from the LLM
 * @returns {string} Clean text ready to display
 */
export function parseResponse(raw) {
  if (!raw || typeof raw !== 'string') return '';

  return raw
    .replace(/^#+\s*/gm, '')        // strip markdown headings
    .replace(/\*\*(.*?)\*\*/g, '$1') // strip bold markers
    .replace(/^\s*[-*]\s+/gm, '• ') // normalise bullet points
    .trim();
}

/**
 * Splits a response into paragraphs for structured display.
 * @param {string} text
 * @returns {string[]}
 */
export function splitParagraphs(text) {
  if (!text) return [];
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
}
