import { supabase } from './supabase.js';
import { getRecentErrors } from './errorService.js';

export const APP_VERSION = '1.0.0-rc1';

const SYNC_KEY = 'medagenda_last_sync';

export async function runDiagnostics() {
  const [dbResult, authResult, storageResult] = await Promise.allSettled([
    checkSupabase(),
    checkAuth(),
    checkStorage(),
  ]);

  return {
    version:       APP_VERSION,
    timestamp:     new Date().toISOString(),
    supabase:      dbResult.status   === 'fulfilled' ? dbResult.value   : { ok: false, error: dbResult.reason?.message },
    auth:          authResult.status === 'fulfilled' ? authResult.value : { ok: false, error: authResult.reason?.message },
    storage:       storageResult.status === 'fulfilled' ? storageResult.value : { ok: false, error: storageResult.reason?.message },
    serviceWorker: checkServiceWorker(),
    push:          checkPush(),
    lastSync:      getLastSync(),
    environment:   getEnvironment(),
    // Não renderizado pelo modal de diagnóstico hoje (ver diagnosticModal.js)
    // — disponível para suporte/depuração via runDiagnostics() diretamente,
    // reaproveitando o buffer de erros que já existia em errorService.js.
    recentErrors:  getRecentErrors(10),
  };
}

async function checkSupabase() {
  const t0 = Date.now();
  try {
    const { error } = await supabase.from('events').select('id').limit(1);
    const latency = Date.now() - t0;
    // PGRST301 = auth error (no session) — connectivity itself is fine
    if (error && error.code !== 'PGRST301' && error.code !== 'PGRST116') {
      return { ok: false, latency, error: error.message };
    }
    return { ok: true, latency };
  } catch (err) {
    return { ok: false, latency: Date.now() - t0, error: err.message };
  }
}

// Confirma se o bucket 'avatars' existe e está acessível, sem depender do
// usuário reproduzir um upload — usado para diagnosticar a causa raiz de
// falhas no avatarService.js (ver ETAPA 3 da auditoria de upload de foto).
async function checkStorage() {
  const t0 = Date.now();
  try {
    const { error } = await supabase.storage.from('avatars').list('', { limit: 1 });
    const latency = Date.now() - t0;
    if (error) return { ok: false, latency, error: error.message };
    return { ok: true, latency };
  } catch (err) {
    return { ok: false, latency: Date.now() - t0, error: err.message };
  }
}

async function checkAuth() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return { ok: false, status: 'Sem sessão ativa' };
  return {
    ok:        true,
    status:    'Autenticado',
    email:     session.user.email,
    expiresAt: new Date(session.expires_at * 1000).toLocaleString('pt-BR'),
  };
}

function checkServiceWorker() {
  if (!('serviceWorker' in navigator)) return { ok: false, status: 'Não suportado neste navegador' };
  const ctrl = navigator.serviceWorker.controller;
  if (!ctrl) return { ok: false, status: 'Não registrado — recarregue a página' };
  return { ok: true, status: 'Ativo' };
}

function checkPush() {
  if (!('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, status: 'Não suportado neste navegador' };
  }
  const perm = Notification.permission;
  return {
    ok:     perm === 'granted',
    status: perm === 'granted' ? 'Autorizado' :
            perm === 'denied'  ? 'Bloqueado pelo usuário' :
                                 'Permissão não solicitada',
    permission: perm,
  };
}

export function updateLastSync() {
  try {
    localStorage.setItem(SYNC_KEY, new Date().toLocaleString('pt-BR'));
  } catch { /* storage unavailable */ }
}

function getLastSync() {
  try { return localStorage.getItem(SYNC_KEY) || 'Nunca'; }
  catch { return 'Desconhecido'; }
}

function getEnvironment() {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'Desenvolvimento (local)';
  if (h.endsWith('github.io'))                return 'Produção (GitHub Pages)';
  return h;
}
