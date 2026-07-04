// ── diagnosticModal.js — Overlay de diagnóstico de serviços ─────────────────

import { runDiagnostics } from "./diagnosticService.js";
import { escapeHtml } from "./utils.js";
import { initModal } from "./modalController.js";

let diagnosticBody  = null;
let diagnosticModal = null;

export function initDiagnosticModal() {
  const diagnosticOverlay = document.getElementById("diagnostic-overlay");
  const diagnosticClose   = document.getElementById("diagnostic-close");

  diagnosticBody = document.getElementById("diagnostic-body");

  if (!diagnosticOverlay) return;

  diagnosticModal = initModal(diagnosticOverlay, closeDiagnosticModal);

  diagnosticClose?.addEventListener("click", closeDiagnosticModal);
}

export async function openDiagnosticModal() {
  diagnosticBody.innerHTML = '<p class="diag-loading">Verificando serviços…</p>';
  diagnosticModal?.open();

  try {
    const r = await runDiagnostics();
    diagnosticBody.innerHTML = renderDiagnosticHTML(r);
  } catch {
    diagnosticBody.innerHTML = '<p class="diag-loading">Erro ao obter diagnóstico.</p>';
  }
}

export function closeDiagnosticModal() {
  diagnosticModal?.close();
}

function renderDiagnosticHTML(r) {
  const items = [
    {
      ok:     r.supabase.ok,
      label:  'Banco de Dados',
      detail: r.supabase.ok
        ? 'Conectado e respondendo'
        : (r.supabase.error || 'Falha na conexão'),
      extra:  r.supabase.latency !== undefined ? `${r.supabase.latency} ms` : '',
    },
    {
      ok:     r.auth.ok,
      label:  'Autenticação',
      detail: r.auth.ok
        ? `${escapeHtml(r.auth.email || '')} — expira ${r.auth.expiresAt}`
        : escapeHtml(r.auth.status),
    },
    {
      ok:     r.storage.ok,
      label:  'Storage (Fotos)',
      detail: r.storage.ok
        ? 'Bucket disponível'
        : escapeHtml(r.storage.error || 'Indisponível'),
      extra:  r.storage.latency !== undefined ? `${r.storage.latency} ms` : '',
    },
    {
      ok:     r.serviceWorker.ok,
      label:  'Service Worker',
      detail: escapeHtml(r.serviceWorker.status),
    },
    {
      ok:     r.push.ok,
      label:  'Notificações Push',
      detail: escapeHtml(r.push.status),
    },
    {
      ok:     true,
      label:  'Última sincronização',
      detail: escapeHtml(r.lastSync),
      neutral: true,
    },
  ];

  const rows = items.map(item => `
    <div class="diag-item">
      <span class="diag-dot ${item.neutral ? 'diag-neutral' : item.ok ? 'diag-ok' : 'diag-error'}"></span>
      <div class="diag-info">
        <div class="diag-label">${item.label}</div>
        <div class="diag-detail">${item.detail}</div>
      </div>
      ${item.extra ? `<span class="diag-latency">${item.extra}</span>` : ''}
    </div>
  `).join('');

  const ts = new Date(r.timestamp).toLocaleString('pt-BR');

  return `${rows}
    <p class="diag-footer">Versão ${escapeHtml(r.version)} · ${escapeHtml(r.environment)} · ${ts}</p>`;
}
