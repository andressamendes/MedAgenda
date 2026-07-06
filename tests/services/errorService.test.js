/**
 * Tests for errorService.js — categorize()/friendlyMessage()/handleError()
 * (F4.2 — Auditoria e Correção do Fluxo de Estados; A1.2 — Contrato
 * Estruturado para Erros de Autenticação).
 *
 * Causa raiz encontrada na auditoria (F4.2): categorize() classificava erros
 * de autenticação só por substrings em inglês na mensagem ('jwt', 'session',
 * 'invalid login'...). Erros reais do auth-js do Supabase (GoTrueClient) —
 * refresh token inválido/ausente/já usado, sessão ausente, JWT malformado —
 * têm mensagens que não batem com nenhuma dessas substrings (ex.: "Auth
 * session missing!", "Invalid Refresh Token: Refresh Token Not Found"), então
 * caíam em UNKNOWN/DATABASE → "Erro ao comunicar com o servidor" em vez de
 * "Sessão expirada" — exatamente o comportamento relatado para o bloco de
 * Revisões (e potencialmente qualquer outra tela, dependendo de qual chamada
 * tocasse esse formato de erro). Todo erro do auth-js carrega a flag interna
 * `__isAuthError`, independentemente da subclasse ou do idioma da mensagem.
 *
 * A1.2 foi além: o último ponto que ainda dependia de mensagem era
 * supabase.currentUserId() lançando um Error comum ("Usuário não
 * autenticado.") para "sem sessão", reconhecido aqui por
 * `msg.includes('não autenticado')` — e os sub-casos de mensagem amigável
 * (credenciais inválidas/e-mail duplicado/não confirmado) também liam a
 * mensagem do SDK em inglês. Ambos foram substituídos por sinais
 * estruturados: supabase.js agora lança AuthError (ver authError.js, mesmo
 * contrato `__isAuthError`) e friendlyMessage() usa `err.code` (o código
 * dedicado que o auth-js já devolve, ex.: 'invalid_credentials',
 * 'user_already_exists', 'email_not_confirmed') em vez de substring de
 * mensagem. categorize()/friendlyMessage() não chamam mais includes()/
 * startsWith() sobre texto de erro para nenhum caso de autenticação.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { AuthError, AUTH_REASONS } from "../../authError.js";

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

test("a PostgREST error with code PGRST301 (JWT expired on a database query, no __isAuthError) is still categorized as auth, by code — never by message", async (t) => {
  const { mod } = await loadErrorService(t);

  assert.strictEqual(
    mod.handleError(Object.assign(new Error("token error"), { code: "PGRST301" }), { silent: true }).category,
    "auth"
  );
});

test("supabase.currentUserId()'s no-session case (AuthError, see authError.js) is categorized as auth via __isAuthError, not via its Portuguese message text", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = new AuthError("Usuário não autenticado.", {
    code: "session_not_found",
    reason: AUTH_REASONS.NO_SESSION,
  });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "auth");
  assert.strictEqual(friendly, "Sua sessão expirou. Faça login novamente.");
});

test("a plain Error with an auth-sounding message but no __isAuthError/code contract is NOT classified as auth (proves message text alone no longer drives auth classification)", async (t) => {
  const { mod } = await loadErrorService(t);

  assert.strictEqual(mod.handleError(new Error("JWT expired"), { silent: true }).category, "unknown");
  assert.strictEqual(mod.handleError(new Error("Usuário não autenticado."), { silent: true }).category, "unknown");
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

test("a rate-limited Supabase auth request (status 429) is categorized as rate_limit, not auth, even though it also carries __isAuthError", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = authApiError("For security purposes, you can only request this after 57 seconds.", {
    status: 429,
    code: "over_email_send_rate_limit",
  });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "rate_limit");
  assert.strictEqual(friendly, "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.");
});

test("a plain error whose message mentions 'rate limit' is also categorized as rate_limit", async (t) => {
  const { mod } = await loadErrorService(t);
  const { category } = mod.handleError(new Error("Email rate limit exceeded"), { silent: true });
  assert.strictEqual(category, "rate_limit");
});

test("'User already registered' (Supabase signUp duplicate email, code user_already_exists) is categorized as auth with a dedicated duplicate-account message, decided by code — not by the English message", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = authApiError("User already registered", { code: "user_already_exists" });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "auth");
  assert.strictEqual(friendly, "Este e-mail já está cadastrado. Faça login.");
});

test("email_not_confirmed code maps to the unconfirmed-email message, decided by code — not by the message", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = authApiError("Email not confirmed", { code: "email_not_confirmed" });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "auth");
  assert.strictEqual(friendly, "Confirme seu e-mail antes de fazer login.");
});

test("invalid_credentials code maps to the invalid-credentials message, decided by code — not by the message text ('Invalid Refresh Token...' also contains 'invalid' but must not match)", async (t) => {
  const { mod } = await loadErrorService(t);

  const invalidLogin = authApiError("Invalid login credentials", { code: "invalid_credentials" });
  assert.strictEqual(mod.handleError(invalidLogin, { silent: true }).friendly, "E-mail ou senha incorretos. Verifique suas credenciais.");

  const refreshInvalid = authApiError("Invalid Refresh Token: Refresh Token Not Found", { code: "refresh_token_not_found" });
  assert.strictEqual(mod.handleError(refreshInvalid, { silent: true }).friendly, "Sua sessão expirou. Faça login novamente.");
});

// ── A1.4 — Fluxo Completo de Recuperação de Senha ───────────────────────────
// Link expirado/reutilizado e link inválido/corrompido são construídos por
// authView.js como AuthError com um `code` próprio (recovery_link_expired /
// recovery_link_invalid) — nunca a mensagem crua do Supabase. Cada código tem
// sua própria mensagem amigável, distinta da mensagem de "sessão expirada".

test("recovery_link_expired code (link de reset expirado ou já utilizado) maps to its own message, never the generic 'session expired' one", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = new AuthError("Email link is invalid or has expired", {
    code: "recovery_link_expired",
    reason: AUTH_REASONS.LINK_EXPIRED,
  });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "auth");
  assert.strictEqual(
    friendly,
    "Este link de redefinição de senha não é mais válido. Ele pode ter expirado ou já ter sido utilizado. Solicite um novo link para continuar."
  );
});

test("recovery_link_invalid code (token ausente/corrompido) maps to its own message, distinct from recovery_link_expired", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = new AuthError("Recovery link missing/corrupt token", {
    code: "recovery_link_invalid",
    reason: AUTH_REASONS.LINK_INVALID,
  });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "auth");
  assert.strictEqual(
    friendly,
    "Este link de redefinição de senha é inválido. Solicite um novo link para continuar."
  );
});

// ── A1.5 — Reautenticação Obrigatória para Alteração de Senha ──────────────

test("current_password_incorrect code (reautenticação para troca de senha) maps to its own message, never the login-style 'e-mail ou senha' one", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = new AuthError("Senha atual incorreta.", {
    code: "current_password_incorrect",
    reason: AUTH_REASONS.CURRENT_PASSWORD_INCORRECT,
  });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "auth");
  assert.strictEqual(friendly, "Senha atual incorreta. Verifique e tente novamente.");
});

// ── A1.6 — Hardening do Login (Rate Limit + Classificação de Erros) ────────
// AuthRetryableFetchError é a classe real do auth-js do Supabase para falha
// de rede/timeout/abort e para 5xx do próprio servidor de autenticação —
// nenhum dos dois casos chega a avaliar credenciais/sessão, então nenhum
// pode virar "sessão expirada", mesmo carregando `__isAuthError: true`.
function authRetryableFetchError(message, extra = {}) {
  return Object.assign(new Error(message), {
    name: "AuthRetryableFetchError",
    __isAuthError: true,
    ...extra,
  });
}

test("HTTP 429 during login (AuthApiError with status 429) is categorized as rate_limit, never as a generic/auth error, and tells the user to wait", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = authApiError("For security purposes, you can only request this after 42 seconds.", {
    status: 429,
    code: "over_request_rate_limit",
  });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "rate_limit");
  assert.strictEqual(friendly, "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.");
});

test("offline/no-network during login (AuthRetryableFetchError with no HTTP status) is categorized as network, not auth — the session was never evaluated", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = authRetryableFetchError("Failed to fetch");

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "network");
  assert.match(friendly, /Sem conexão/);
});

test("a request timeout during login (AuthRetryableFetchError wrapping an aborted/timed-out fetch) is categorized as network with a timeout-specific message, not the generic offline text", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = authRetryableFetchError("The operation timed out");

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "network");
  assert.strictEqual(friendly, "A conexão demorou mais que o esperado. Verifique sua internet e tente novamente.");
});

test("a native AbortError (fetch aborted by a timeout controller) is categorized as network with the timeout message", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = Object.assign(new Error("The user aborted a request."), { name: "AbortError" });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "network");
  assert.strictEqual(friendly, "A conexão demorou mais que o esperado. Verifique sua internet e tente novamente.");
});

test("the Supabase Auth server itself being unavailable (AuthRetryableFetchError with status 503) is categorized as server_unavailable, never masked as 'sessão expirada'", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = authRetryableFetchError("Service Unavailable", { status: 503 });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "server_unavailable");
  assert.strictEqual(friendly, "Servidor indisponível no momento. Tente novamente em instantes.");
});

test("a generic 5xx error with no auth/database code is categorized as server_unavailable, not database or unknown", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = Object.assign(new Error("Bad Gateway"), { status: 502 });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "server_unavailable");
  assert.strictEqual(friendly, "Servidor indisponível no momento. Tente novamente em instantes.");
});

test("invalid login credentials (autenticação inválida) keeps its own dedicated message, distinct from session-expired/rate-limit/network/server-unavailable", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = authApiError("Invalid login credentials", { code: "invalid_credentials" });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "auth");
  assert.strictEqual(friendly, "E-mail ou senha incorretos. Verifique suas credenciais.");
});

test("an expired/dead session (refresh token invalid, no dedicated code) is categorized as auth with the session-expired message, distinct from invalid-credentials", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = authApiError("Invalid Refresh Token: Refresh Token Not Found", { code: "refresh_token_not_found" });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "auth");
  assert.strictEqual(friendly, "Sua sessão expirou. Faça login novamente.");
});

test("the database being unavailable (PostgREST/Postgres error, no __isAuthError) is categorized as database, distinct from server_unavailable and never shown as a login/session error", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = Object.assign(new Error("could not connect to database"), { code: "57P03" });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "database");
  assert.strictEqual(friendly, "Erro ao comunicar com o servidor. Tente novamente em instantes.");
});

test("ETAPA 3 — the seven scenarios never collapse into each other: each maps to its own distinct friendly message", async (t) => {
  const { mod } = await loadErrorService(t);

  const scenarios = {
    rate_limit: mod.handleError(authApiError("rate limited", { status: 429 }), { silent: true }).friendly,
    network: mod.handleError(authRetryableFetchError("Failed to fetch"), { silent: true }).friendly,
    server_unavailable: mod.handleError(authRetryableFetchError("down", { status: 503 }), { silent: true }).friendly,
    auth_invalid: mod.handleError(authApiError("Invalid login credentials", { code: "invalid_credentials" }), { silent: true }).friendly,
    session_expired: mod.handleError(authApiError("Invalid Refresh Token: Refresh Token Not Found"), { silent: true }).friendly,
    database: mod.handleError(Object.assign(new Error("db down"), { code: "57P03" }), { silent: true }).friendly,
  };

  const uniqueMessages = new Set(Object.values(scenarios));
  assert.strictEqual(uniqueMessages.size, Object.keys(scenarios).length, JSON.stringify(scenarios, null, 2));
});

// ── P0 — Proteção contra Divergência de Schema ──────────────────────────────
// SchemaMismatchError (ver schemaService.js) carrega a flag `__schemaMismatch`,
// no mesmo contrato de AuthError/AIError — reconhecida por categorize() antes
// de qualquer heurística de banco/rede, para nunca virar "Erro ao comunicar
// com o servidor" (categoria database).

function schemaMismatchError(message, extra = {}) {
  return Object.assign(new Error(message), {
    name: "SchemaMismatchError",
    __schemaMismatch: true,
    ...extra,
  });
}

test("a SchemaMismatchError is categorized as schema_mismatch, with its own dedicated friendly message", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = schemaMismatchError("O banco de dados está em uma versão de schema anterior à exigida por este build do frontend.", {
    code: "schema_outdated", dbVersion: 10, expectedVersion: 14,
  });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "schema_mismatch");
  assert.strictEqual(friendly, "Esta versão do sistema requer uma atualização do banco de dados antes de poder ser utilizada.");
});

test("a SchemaMismatchError is never categorized as database, network, server or auth, even if its message/code could otherwise match one of them", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = schemaMismatchError('relation "public.schema_version" does not exist', { code: "42P01" });

  const { category } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "schema_mismatch");
});

test("a genuine database error (code 42P01, no __schemaMismatch flag) is still categorized as database, not schema_mismatch", async (t) => {
  const { mod } = await loadErrorService(t);
  const err = Object.assign(new Error('relation "public.events" does not exist'), { code: "42P01" });

  const { category, friendly } = mod.handleError(err, { silent: true });
  assert.strictEqual(category, "database");
  assert.strictEqual(friendly, "Erro ao comunicar com o servidor. Tente novamente em instantes.");
});

test("handleError()'s fallbackMessage option only replaces the true catch-all (unknown) message, never a specific classified message", async (t) => {
  const { mod } = await loadErrorService(t);

  const unknown = mod.handleError(new Error("boom"), { silent: true, fallbackMessage: "tela X: algo falhou." });
  assert.strictEqual(unknown.friendly, "tela X: algo falhou.");

  const invalidLogin = mod.handleError(authApiError("Invalid login credentials", { code: "invalid_credentials" }), {
    silent: true,
    fallbackMessage: "tela X: algo falhou.",
  });
  assert.strictEqual(invalidLogin.friendly, "E-mail ou senha incorretos. Verifique suas credenciais.");

  const network = mod.handleError(new Error("Failed to fetch"), {
    silent: true,
    fallbackMessage: "tela X: algo falhou.",
  });
  assert.match(network.friendly, /Sem conexão/);
});
