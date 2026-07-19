/**
 * Tests for scripts/strip-html-comments.js — F11 E21 (auditoria #28),
 * build de produção do HTML. `stripHtmlComments()` é uma função pura
 * (string → string); a parte de I/O (CLI) fica atrás do main-guard e não é
 * exercida aqui, mesmo padrão de tests/scripts/check-schema.test.js.
 */
import { test } from "node:test";
import assert from "node:assert";
import { stripHtmlComments } from "../../scripts/strip-html-comments.js";

test("removes a single HTML comment", () => {
  const html = "<div>\n  <!-- um comentário -->\n  <p>Olá</p>\n</div>";
  assert.strictEqual(stripHtmlComments(html), "<div>\n  \n  <p>Olá</p>\n</div>");
});

test("removes multiple comments across the document", () => {
  const html = "<!-- topo -->\n<p>A</p>\n<!-- meio -->\n<p>B</p>\n<!-- fim -->";
  assert.strictEqual(stripHtmlComments(html), "\n<p>A</p>\n\n<p>B</p>\n");
});

test("removes a multi-line comment block", () => {
  const html = "<div>\n<!--\n  Linha 1\n  Linha 2\n-->\n<p>Conteúdo</p>\n</div>";
  assert.strictEqual(stripHtmlComments(html), "<div>\n\n<p>Conteúdo</p>\n</div>");
});

test("preserves <!DOCTYPE html> — not an HTML comment", () => {
  const html = "<!DOCTYPE html>\n<html>\n<!-- nota -->\n</html>";
  const result = stripHtmlComments(html);
  assert.match(result, /^<!DOCTYPE html>/);
  assert.doesNotMatch(result, /nota/);
});

test("leaves HTML with no comments untouched", () => {
  const html = "<div><p>Sem comentários aqui.</p></div>";
  assert.strictEqual(stripHtmlComments(html), html);
});

test("never touches JS/CSS content that has no HTML comment syntax", () => {
  const html = '<script>\n  const a = 1;\n  const isGreater = a => a > 0;\n</script>';
  assert.strictEqual(stripHtmlComments(html), html);
});

test("real index.html has balanced comment markers and no leftovers after stripping", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const result = stripHtmlComments(html);

  assert.strictEqual(result.includes("<!--"), false, "no opening comment marker should survive");
  assert.match(result, /^<!DOCTYPE html>/, "the doctype must survive");
  assert.ok(result.length < html.length, "stripping comments must shrink the file");
});
