// ── healthService.js — Saúde do Sistema (O1) ────────────────────────────────
//
// Ponto único de consolidação da saúde da aplicação. Não faz novas consultas
// de rede além das já feitas por diagnosticService/schemaService — apenas
// combina o que essas fontes já expõem (mais o buffer em memória de
// errorService) em um único status agregado. Nenhuma lógica de negócio:
// não decide o que fazer com o resultado, apenas descreve o estado atual.

import { runDiagnostics } from './diagnosticService.js';
import { getRecentErrors } from './errorService.js';
import { diagnoseSchema } from './schemaService.js';

export const HEALTH_STATUS = {
  HEALTHY:  'HEALTHY',
  WARNING:  'WARNING',
  DEGRADED: 'DEGRADED',
  OFFLINE:  'OFFLINE',
};

// Janela em que um erro conta como "recente" para fins de erros recorrentes
// e de detecção de Edge Function indisponível.
const RECENT_WINDOW_MS = 5 * 60 * 1000;
const RECURRING_ERROR_THRESHOLD = 3;
const LATENCY_WARNING_MS = 2000;

function isRecent(ts, now) {
  const t = new Date(ts).getTime();
  return Number.isFinite(t) && (now - t) <= RECENT_WINDOW_MS;
}

/**
 * "Autenticado" (auth.ok) vs "sessão expirada" (erro de categoria 'auth'
 * recente, mas sem sessão válida) vs "não autenticado" (estado normal de
 * usuário deslogado, não é uma condição de saúde degradada).
 */
function computeAuthStatus(auth, recentErrors) {
  if (auth.ok) return 'authenticated';
  const hasRecentAuthError = recentErrors.some(e => e.category === 'auth');
  return hasRecentAuthError ? 'expired' : 'unauthenticated';
}

/**
 * Nenhuma Edge Function é invocada aqui propositalmente (evitaria duplicar
 * chamadas já feitas pelo restante do app, e algumas são destrutivas, ex.:
 * delete-account). Disponibilidade é inferida do buffer de erros já coletado
 * por errorService: um erro de IA com code 'UNAVAILABLE' (ver
 * geminiProvider.js) ou categoria 'server_unavailable' recente indica que a
 * última tentativa de falar com uma Edge Function falhou.
 */
function computeEdgeFunctionsStatus(recentErrors, now) {
  const unavailable = recentErrors.some(e =>
    isRecent(e.ts, now) &&
    (e.category === 'server_unavailable' || (e.category === 'ai' && e.code === 'UNAVAILABLE'))
  );
  return unavailable ? 'unavailable' : 'available';
}

function countRecentErrors(recentErrors, now) {
  return recentErrors.filter(e => isRecent(e.ts, now)).length;
}

export async function checkHealth() {
  const now = Date.now();

  const [diagnostics, schema] = await Promise.all([
    runDiagnostics(),
    diagnoseSchema(),
  ]);

  const recentErrors = getRecentErrors(20);
  const authStatus = computeAuthStatus(diagnostics.auth, recentErrors);
  const edgeFunctionsStatus = computeEdgeFunctionsStatus(recentErrors, now);
  const recentErrorCount = countRecentErrors(recentErrors, now);
  const lastError = recentErrors[0] ?? null;

  const components = {
    database: {
      ok:      diagnostics.supabase.ok,
      latency: diagnostics.supabase.latency ?? null,
      error:   diagnostics.supabase.error ?? null,
    },
    auth: {
      status:    authStatus,
      email:     diagnostics.auth.email ?? null,
      expiresAt: diagnostics.auth.expiresAt ?? null,
    },
    schema: {
      compatible:      schema.compatible,
      code:            schema.code,
      dbVersion:       schema.dbVersion,
      expectedVersion: schema.expectedVersion,
    },
    edgeFunctions: {
      status: edgeFunctionsStatus,
    },
    sync: {
      lastSync: diagnostics.lastSync,
    },
  };

  const status = computeOverallStatus(components, authStatus, recentErrorCount);

  return {
    status,
    timestamp: new Date(now).toISOString(),
    components,
    recentErrorCount,
    lastError,
  };
}

/**
 * Prioridade fixa OFFLINE > DEGRADED > WARNING > HEALTHY — o pior critério
 * atendido decide o status geral.
 */
function computeOverallStatus(components, authStatus, recentErrorCount) {
  if (!components.database.ok) return HEALTH_STATUS.OFFLINE;

  if (!components.schema.compatible || components.edgeFunctions.status === 'unavailable') {
    return HEALTH_STATUS.DEGRADED;
  }

  if (
    authStatus === 'expired' ||
    recentErrorCount >= RECURRING_ERROR_THRESHOLD ||
    (components.database.latency !== null && components.database.latency > LATENCY_WARNING_MS)
  ) {
    return HEALTH_STATUS.WARNING;
  }

  return HEALTH_STATUS.HEALTHY;
}
