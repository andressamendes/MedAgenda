// ── diagnosticModal.js — Overlay de diagnóstico de serviços ─────────────────

import { runDiagnostics } from "./diagnosticService.js";
import { checkHealth, HEALTH_STATUS } from "./healthService.js";
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
    const [r, health] = await Promise.all([runDiagnostics(), checkHealth()]);
    diagnosticBody.innerHTML = renderHealthSummaryHTML(health) + renderDiagnosticHTML(r, health);
  } catch {
    diagnosticBody.innerHTML = '<p class="diag-loading">Erro ao obter diagnóstico.</p>';
  }
}

export function closeDiagnosticModal() {
  diagnosticModal?.close();
}

const HEALTH_LABELS = {
  [HEALTH_STATUS.HEALTHY]:  'Saudável',
  [HEALTH_STATUS.WARNING]:  'Atenção',
  [HEALTH_STATUS.DEGRADED]: 'Degradado',
  [HEALTH_STATUS.OFFLINE]:  'Offline',
};

const HEALTH_DOT = {
  [HEALTH_STATUS.HEALTHY]:  'diag-ok',
  [HEALTH_STATUS.WARNING]:  'diag-warning',
  [HEALTH_STATUS.DEGRADED]: 'diag-warning',
  [HEALTH_STATUS.OFFLINE]:  'diag-error',
};

function renderHealthSummaryHTML(health) {
  const lastErrorText = health.lastError
    ? `${escapeHtml(health.lastError.friendly || health.lastError.message)} (${new Date(health.lastError.ts).toLocaleString('pt-BR')})`
    : 'Nenhum erro recente';

  return `
    <div class="diag-item">
      <span class="diag-dot ${HEALTH_DOT[health.status]}"></span>
      <div class="diag-info">
        <div class="diag-label">Saúde do Sistema — ${HEALTH_LABELS[health.status]}</div>
        <div class="diag-detail">Último erro: ${lastErrorText}</div>
      </div>
    </div>
  `;
}

function renderDiagnosticHTML(r, health) {
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
      ok:     health.components.schema.compatible,
      label:  'Schema do Banco',
      detail: health.components.schema.compatible
        ? `Versão ${health.components.schema.dbVersion}`
        : `Incompatível (${health.components.schema.code || 'desconhecido'})`,
    },
    {
      ok:     health.components.edgeFunctions.status === 'available',
      label:  'Edge Functions',
      detail: health.components.edgeFunctions.status === 'available'
        ? 'Disponíveis'
        : 'Indisponibilidade recente detectada',
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
