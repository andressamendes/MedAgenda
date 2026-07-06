/**
 * Tests for auth.js — login/logout/session against Supabase Auth.
 * Supabase is fully mocked: no network, no real project required.
 */
import { test, before, after } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";
import { ensureTestConfig } from "../mocks/configFixture.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;
const CONFIG_SPECIFIER   = new URL("../../config.js", import.meta.url).href;

// auth.js imports APP_URL from config.js directly; mock.module() can only
// intercept a specifier that resolves to a real file, so make sure one
// exists on disk for the duration of this file's tests (see configFixture.js).
let _restoreConfig;
before(() => { _restoreConfig = ensureTestConfig(); });
after(() => { _restoreConfig(); });

function loadAuth(t, authResponses) {
  const supabase = createSupabaseMock({ authResponses });
  t.mock.module(SUPABASE_SPECIFIER, { namedExports: { supabase } });
  t.mock.module(CONFIG_SPECIFIER, {
    namedExports: { APP_URL: "http://localhost:8080", SUPABASE_URL: "x", SUPABASE_ANON_KEY: "y" },
  });
  return import(`../../auth.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

test("signIn() — golden path returns the session data", async (t) => {
  const session = { session: { access_token: "tok" }, user: { id: "user-123" } };
  const { mod } = await loadAuth(t, {
    signInWithPassword: async ({ email, password }) => {
      assert.strictEqual(email, "aluna@example.com");
      assert.strictEqual(password, "senha-correta");
      return { data: session, error: null };
    },
  });

  const result = await mod.signIn("aluna@example.com", "senha-correta");

  assert.deepStrictEqual(result, session);
});

test("signIn() — invalid credentials reject with the Supabase error", async (t) => {
  const { mod } = await loadAuth(t, {
    signInWithPassword: async () => ({
      data: null,
      error: { message: "Invalid login credentials" },
    }),
  });

  await assert.rejects(
    () => mod.signIn("aluna@example.com", "senha-errada"),
    (err) => err.message === "Invalid login credentials"
  );
});

test("signOut() — golden path resolves without error", async (t) => {
  let called = false;
  const { mod } = await loadAuth(t, {
    signOut: async () => { called = true; return { error: null }; },
  });

  await mod.signOut();

  assert.strictEqual(called, true);
});

test("signOut() — propagates a Supabase error", async (t) => {
  const { mod } = await loadAuth(t, {
    signOut: async () => ({ error: { message: "network error" } }),
  });

  await assert.rejects(
    () => mod.signOut(),
    (err) => err.message === "network error"
  );
});

test("getSession() — returns the current session when present", async (t) => {
  const session = { user: { id: "user-123" } };
  const { mod } = await loadAuth(t, {
    getSession: async () => ({ data: { session }, error: null }),
  });

  const result = await mod.getSession();

  assert.deepStrictEqual(result, session);
});

test("getSession() — returns null when there is no active session", async (t) => {
  const { mod } = await loadAuth(t, {
    getSession: async () => ({ data: { session: null }, error: null }),
  });

  const result = await mod.getSession();

  assert.strictEqual(result, null);
});

// ── A1.4 — Fluxo Completo de Recuperação de Senha ───────────────────────────
// parseAuthRedirectError()/hasRecoveryIntent() só leem a URL (nunca chamam o
// SDK) — são o meio de authView.js detectar, no carregamento, um link de
// e-mail que o Supabase já rejeitou (expirado/reutilizado) antes que
// PASSWORD_RECOVERY jamais tivesse a chance de disparar.

test("parseAuthRedirectError() — returns null when the URL carries no auth error", async (t) => {
  const { mod } = await loadAuth(t, {});
  assert.strictEqual(mod.parseAuthRedirectError("http://localhost/"), null);
  assert.strictEqual(mod.parseAuthRedirectError("http://localhost/#access_token=abc&type=recovery"), null);
});

test("parseAuthRedirectError() — extracts error/error_code/error_description from an expired-or-reused recovery link", async (t) => {
  const { mod } = await loadAuth(t, {});
  const url = "http://localhost/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

  assert.deepStrictEqual(mod.parseAuthRedirectError(url), {
    error: "access_denied",
    errorCode: "otp_expired",
    errorDescription: "Email link is invalid or has expired",
  });
});

test("parseAuthRedirectError() — also reads the error params from the query string", async (t) => {
  const { mod } = await loadAuth(t, {});
  const result = mod.parseAuthRedirectError("http://localhost/?error=access_denied&error_code=otp_expired");
  assert.strictEqual(result.errorCode, "otp_expired");
});

test("hasRecoveryIntent() — true only when the URL (hash or query) carries type=recovery", async (t) => {
  const { mod } = await loadAuth(t, {});
  assert.strictEqual(mod.hasRecoveryIntent("http://localhost/#access_token=abc&type=recovery"), true);
  assert.strictEqual(mod.hasRecoveryIntent("http://localhost/?type=recovery"), true);
  assert.strictEqual(mod.hasRecoveryIntent("http://localhost/"), false);
  assert.strictEqual(mod.hasRecoveryIntent("http://localhost/#access_token=abc&type=signup"), false);
});

// ── A1.5 — Reautenticação Obrigatória para Alteração de Senha ──────────────
// reauthenticate() usa a mesma API oficial do login (signInWithPassword)
// para reconfirmar a senha atual — nunca cria sessão paralela nem token
// próprio, e nunca persiste a senha em nenhuma variável do módulo.

test("reauthenticate() — golden path: resolves without error when the current password is correct", async (t) => {
  const { mod } = await loadAuth(t, {
    getSession: async () => ({ data: { session: { user: { email: "aluna@example.com" } } }, error: null }),
    signInWithPassword: async ({ email, password }) => {
      assert.strictEqual(email, "aluna@example.com");
      assert.strictEqual(password, "senha-correta");
      return { data: { user: { id: "user-123" } }, error: null };
    },
  });

  await assert.doesNotReject(() => mod.reauthenticate("senha-correta"));
});

test("reauthenticate() — wrong current password (code invalid_credentials) throws a dedicated AuthError, not the raw Supabase error", async (t) => {
  const { mod } = await loadAuth(t, {
    getSession: async () => ({ data: { session: { user: { email: "aluna@example.com" } } }, error: null }),
    signInWithPassword: async () => ({
      data: null,
      error: Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" }),
    }),
  });

  await assert.rejects(
    () => mod.reauthenticate("senha-errada"),
    (err) => {
      assert.strictEqual(err.__isAuthError, true);
      assert.strictEqual(err.code, "current_password_incorrect");
      return true;
    }
  );
});

test("reauthenticate() — any other Supabase auth error (e.g. rate limit) is propagated as-is, not reclassified as a wrong password", async (t) => {
  const { mod } = await loadAuth(t, {
    getSession: async () => ({ data: { session: { user: { email: "aluna@example.com" } } }, error: null }),
    signInWithPassword: async () => ({
      data: null,
      error: Object.assign(new Error("For security purposes, you can only request this after 30 seconds."), {
        code: "over_request_rate_limit",
        status: 429,
      }),
    }),
  });

  await assert.rejects(
    () => mod.reauthenticate("qualquer-senha"),
    (err) => err.code === "over_request_rate_limit"
  );
});

test("reauthenticate() — no active session throws a structured AuthError (no_session), never a plain/technical error", async (t) => {
  const { mod } = await loadAuth(t, {
    getSession: async () => ({ data: { session: null }, error: null }),
  });

  await assert.rejects(
    () => mod.reauthenticate("qualquer-senha"),
    (err) => err.__isAuthError === true && err.code === "session_not_found"
  );
});
