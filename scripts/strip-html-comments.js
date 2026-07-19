#!/usr/bin/env node
// ── strip-html-comments.js — Build de produção do HTML (F11 E21) ───────────
//
// Auditoria #28: index.html carrega centenas de comentários de decisão de
// produto/arquitetura (referências a F1-F11, auditorias, PRs) — úteis para
// quem desenvolve o app, mas expostos a qualquer visitante que abrir "Ver
// código-fonte" na produção. Este script roda só no workflow de deploy
// (.github/workflows/deploy.yml), nunca localmente: remove os comentários
// HTML (`<!-- ... -->`) do arquivo indicado, escrevendo o resultado de volta
// no mesmo caminho — a checagem do runner de CI é uma cópia efêmera do
// repositório, nunca o clone local de quem desenvolve.
//
// `<!DOCTYPE html>` não é um comentário HTML (não tem `--`) e por isso nunca
// é afetado pelo regex abaixo, sem necessidade de tratamento especial.

import { readFileSync, writeFileSync } from "node:fs";

export function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: node scripts/strip-html-comments.js <arquivo>");
    process.exitCode = 1;
    return;
  }

  const html = readFileSync(file, "utf8");
  const stripped = stripHtmlComments(html);
  writeFileSync(file, stripped);

  const removedBytes = html.length - stripped.length;
  console.log(`${file}: comentários HTML removidos (${removedBytes} bytes).`);
}

// Só executa como CLI quando chamado diretamente (node scripts/strip-html-comments.js),
// nunca quando importado pelos testes (tests/scripts/strip-html-comments.test.js).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
