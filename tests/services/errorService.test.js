/**
 * Tests for errorService.js — categorize()/friendlyMessage()/handleError()
 * (F4.2 — Auditoria e Correção do Fluxo de Estados).
 *
 * Causa raiz encontrada na auditoria: categorize() classificava erros de
 * autenticação só por substrings em inglês na mensagem ('jwt', 'session',
 * 'invalid login'...). Erros reais do auth-js do Supabase (GoTrueClient) —
 * refresh token inválido/ausente/já usado, sessão ausente, JWT malformado —
 * têm mensagens que não batem com nenhuma dessas substrings (ex.: "Auth
 * session missing!", "Invalid Refresh Token: Refresh Token Not Found"), então
 * caíam em UNKNOWN/DATABASE → "Erro ao comunicar com o servidor" em vez de
 * "Sessão expirada" — exatamente o comportamento relatado para o bloco de
 * Revisões (e potencialmente qualquer outra tela, dependendo de qual chamada
 * tocasse esse formato de erro). Todo erro do auth-js carrega a flag interna
 * `__isAuthError`, independentemente da subclasse ou do idioma da mensagem —
 * esse é o sinal usado agora, sem duplicar a lógica de classificação em
 * nenhum outro lugar (stateView.js continua sem conhecer errorService.js).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

const TOAST_SPECIFIER     = new URL("../../toastService.js", import.meta.url).href;
const TELEMETRY_SPECIFIER = new URL("../../telemetryService.js", import.meta.url).href;

function loadErrorService(t) {
  const toasts = [];
  const tracked = [];
  t.mock.module(TOAST_SPECIFIER, {
    namedExports: { showToast: (msg, kind) => toasts.push({ msg, kind }) },
  });
  t.mock.module(TELEMETRY_SPECIFIER, {
    namedExports: {
      track: (event, payload) => tracked.push({ event, payload }),
      EVENTS: { ERROR: "error" },
    },
  });
  return import(`../../errorService.js?t=${Math.random()}`).then(mod => ({ mod, toasts, tracked }));
}

// Formato real de um AuthApiError do auth-js (Supabase) — sempre com
// `__isAuthError: true`, independentemente da subclasse ou da mensagem.
function authApiError(message, extra = {}) {
  return Object.assign(new Error(message), {
    name: "AuthApiError",
    __isAuthError: true,
    status: 400,
    ...extra,
  });
}

beforeEach(() => {});
afterEach(() => {});

test("a real Supabase refresh-token-invalid error is categorized as auth, even though its message matches no English keyword", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = authApiError("Invalid Refresh Token: Refresh Token Not Found", { code: "refresh_token_not_found" });

  const { category, friendly } = mod.handleError(err, { silent: true });

  assert.strictEqual(category, "auth");
  assert.strictEqual(friendly, "Sua sessão expirou. Faça login novamente.");
});

test("AuthSessionMissingError ('Auth session missing!') is categorized as auth despite not containing 'session' literally as expected by the old heuristic", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = Object.assign(new Error("Auth session missing!"), {
    name: "AuthSessionMissingError",
    __isAuthError: true,
    status: 400,
  });

  const { category } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "auth");
});

test("still recognizes the legacy Portuguese/English keyword paths (JWT expired, código PGRST301) for plain (non auth-js) errors", async (t) => {
  const { mod } = await loadErrorService(t);

  assert.strictEqual(mod.handleError(new Error("JWT expired"), { silent: true }).category, "auth");
  assert.strictEqual(
    mod.handleError(Object.assign(new Error("token error"), { code: "PGRST301" }), { silent: true }).category,
    "auth"
  );
  assert.strictEqual(mod.handleError(new Error("Usuário não autenticado."), { silent: true }).category, "auth");
});

test("a genuine database/RLS error (no __isAuthError, code 42501) is still categorized as database, not auth", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = Object.assign(new Error("permission denied for table reviews"), { code: "42501" });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "database");
  assert.strictEqual(friendly, "Erro ao comunicar com o servidor. Tente novamente em instantes.");
});

test("a network error (failed to fetch) is categorized as network, not auth", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = new Error("Failed to fetch");

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "network");
  assert.match(friendly, /Sem conexão/);
});

test("auth-category errors never trigger a toast even when showToast isn't explicitly silenced (matches the F4.1 rule: session-expired is never a passive toast)", async (t) => {
  const { mod, toasts } = await loadErrorService(t);
  mod.handleError(authApiError("Invalid Refresh Token: Refresh Token Not Found"), { context: "test" });

  assert.strictEqual(toasts.length, 0);
});

test("__isAuthError takes precedence over the AIError check ordering (AIError is still checked first and wins for AI-specific errors)", async (t) => {
  const { mod } = await loadErrorService(t);
  const aiErr = Object.assign(new Error("Serviço de IA indisponível."), { name: "AIError" });

  assert.strictEqual(mod.handleError(aiErr, { silent: true }).category, "ai");
});
