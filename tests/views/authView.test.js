/**
 * Tests for authView.js — unificação ao pipeline central de erros (A1.1).
 *
 * authView.js não decide mais nenhuma mensagem de erro por conta própria
 * (nada de if/else ou includes() em cima de err.message): cada handler só
 * chama errorService.handleError() e usa o `friendly` retornado. Estes
 * testes usam o errorService.js real (não mockado) para provar a integração
 * de ponta a ponta — a mesma classificação usada em qualquer outra tela do
 * app é a que decide o texto exibido aqui.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const AUTH_SPECIFIER      = new URL("../../auth.js", import.meta.url).href;
const TELEMETRY_SPECIFIER = new URL("../../telemetryService.js", import.meta.url).href;
const TOAST_SPECIFIER     = new URL("../../toastService.js", import.meta.url).href;
const WEEKVIEW_SPECIFIER  = new URL("../../weekView.js", import.meta.url).href;

beforeEach(() => { installDom(); });
afterEach(() => { uninstallDom(); });

function authApiError(message, extra = {}) {
  return Object.assign(new Error(message), {
    name: "AuthApiError",
    __isAuthError: true,
    status: 400,
    ...extra,
  });
}

function loadAuthView(t, authOverrides = {}) {
  t.mock.module(AUTH_SPECIFIER, {
    namedExports: {
      signIn:            async () => { throw new Error("not stubbed: signIn"); },
      signUp:             async () => { throw new Error("not stubbed: signUp"); },
      signOut:            async () => {},
      getSession:         async () => null,
      onAuthStateChange:  () => {},
      sendPasswordReset:  async () => { throw new Error("not stubbed: sendPasswordReset"); },
      updatePassword:     async () => { throw new Error("not stubbed: updatePassword"); },
      ...authOverrides,
    },
  });
  t.mock.module(TELEMETRY_SPECIFIER, {
    namedExports: {
      track: () => {},
      EVENTS: { LOGIN: "login", LOGOUT: "logout", SIGNUP: "signup", ERROR: "error" },
    },
  });
  t.mock.module(TOAST_SPECIFIER, {
    namedExports: {
      showToast: () => {},
      toast: { success: () => {}, error: () => {}, info: () => {} },
    },
  });
  t.mock.module(WEEKVIEW_SPECIFIER, {
    namedExports: { destroyWeekView: () => {} },
  });
  return import(`../../authView.js?t=${Math.random()}`);
}

function initView(mod) {
  mod.initAuthView({ onSignedIn: async () => {}, onBeforeSignOut: () => {} });
}

async function clickAndWait(btn) {
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  // Let the async click handler's microtasks (await signIn/signUp/etc.) settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("login: invalid credentials shows the friendly 'wrong email or password' message (no substring matching left in the view)", async (t) => {
  const mod = await loadAuthView(t, {
    signIn: async () => { throw authApiError("Invalid login credentials"); },
  });
  initView(mod);

  document.getElementById("email").value = "aluna@example.com";
  document.getElementById("password").value = "senha-errada";
  await clickAndWait(document.getElementById("btn-login"));

  assert.strictEqual(
    document.getElementById("error-msg").textContent,
    "E-mail ou senha incorretos. Verifique suas credenciais."
  );
});

test("login: nonexistent user — Supabase returns the same generic invalid-credentials error (no user enumeration), same friendly message", async (t) => {
  const mod = await loadAuthView(t, {
    signIn: async () => { throw authApiError("Invalid login credentials"); },
  });
  initView(mod);

  document.getElementById("email").value = "ninguem@example.com";
  document.getElementById("password").value = "qualquer";
  await clickAndWait(document.getElementById("btn-login"));

  assert.strictEqual(
    document.getElementById("error-msg").textContent,
    "E-mail ou senha incorretos. Verifique suas credenciais."
  );
});

test("login: unconfirmed email shows the friendly confirmation message", async (t) => {
  const mod = await loadAuthView(t, {
    signIn: async () => { throw authApiError("Email not confirmed"); },
  });
  initView(mod);

  document.getElementById("email").value = "aluna@example.com";
  document.getElementById("password").value = "senha-correta";
  await clickAndWait(document.getElementById("btn-login"));

  assert.strictEqual(
    document.getElementById("error-msg").textContent,
    "Confirme seu e-mail antes de fazer login."
  );
});

test("login: network error shows the shared network message, not the login-specific fallback", async (t) => {
  const mod = await loadAuthView(t, {
    signIn: async () => { throw new Error("Failed to fetch"); },
  });
  initView(mod);

  document.getElementById("email").value = "aluna@example.com";
  document.getElementById("password").value = "senha-correta";
  await clickAndWait(document.getElementById("btn-login"));

  assert.match(document.getElementById("error-msg").textContent, /Sem conexão/);
});

test("login: a generic server/database error shows the shared server message", async (t) => {
  const mod = await loadAuthView(t, {
    signIn: async () => { throw Object.assign(new Error("permission denied for table users"), { code: "42501" }); },
  });
  initView(mod);

  document.getElementById("email").value = "aluna@example.com";
  document.getElementById("password").value = "senha-correta";
  await clickAndWait(document.getElementById("btn-login"));

  assert.strictEqual(
    document.getElementById("error-msg").textContent,
    "Erro ao comunicar com o servidor. Tente novamente em instantes."
  );
});

test("login: an auth-flagged error that isn't invalid-credentials/unconfirmed still uses the shared auth-default message (same classification as every other screen)", async (t) => {
  const mod = await loadAuthView(t, {
    signIn: async () => { throw authApiError("Something odd happened"); },
  });
  initView(mod);

  document.getElementById("email").value = "aluna@example.com";
  document.getElementById("password").value = "senha-correta";
  await clickAndWait(document.getElementById("btn-login"));

  assert.strictEqual(
    document.getElementById("error-msg").textContent,
    "Sua sessão expirou. Faça login novamente."
  );
});

test("login: a plain (non-auth-flagged, non-categorized) error falls back to the login-specific message supplied by the view", async (t) => {
  const mod = await loadAuthView(t, {
    signIn: async () => { throw new Error("boom"); },
  });
  initView(mod);

  document.getElementById("email").value = "aluna@example.com";
  document.getElementById("password").value = "senha-correta";
  await clickAndWait(document.getElementById("btn-login"));

  assert.strictEqual(
    document.getElementById("error-msg").textContent,
    "Não foi possível fazer login. Tente novamente."
  );
});

test("signup: 'already registered' error is classified centrally and shown as duplicate-account message", async (t) => {
  const mod = await loadAuthView(t, {
    signUp: async () => { throw authApiError("User already registered"); },
  });
  initView(mod);

  document.getElementById("reg-name").value     = "Aluna Teste";
  document.getElementById("reg-email").value    = "aluna@example.com";
  document.getElementById("reg-password").value = "12345678";
  document.getElementById("reg-confirm").value  = "12345678";
  document.getElementById("reg-terms").checked  = true;
  await clickAndWait(document.getElementById("btn-register"));

  assert.strictEqual(
    document.getElementById("register-error").textContent,
    "Este e-mail já está cadastrado. Faça login."
  );
});

test("signup: rate limit error shows the shared rate-limit message instead of a raw Supabase string", async (t) => {
  const mod = await loadAuthView(t, {
    signUp: async () => { throw authApiError("Email rate limit exceeded", { status: 429 }); },
  });
  initView(mod);

  document.getElementById("reg-name").value     = "Aluna Teste";
  document.getElementById("reg-email").value    = "aluna@example.com";
  document.getElementById("reg-password").value = "12345678";
  document.getElementById("reg-confirm").value  = "12345678";
  document.getElementById("reg-terms").checked  = true;
  await clickAndWait(document.getElementById("btn-register"));

  assert.strictEqual(
    document.getElementById("register-error").textContent,
    "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente."
  );
});

test("signup: a genuine database error never leaks the raw Supabase/Postgres message, shows the shared duplicate-record message", async (t) => {
  const mod = await loadAuthView(t, {
    signUp: async () => {
      throw Object.assign(
        new Error("duplicate key value violates unique constraint \"profiles_pkey\""),
        { code: "23505" }
      );
    },
  });
  initView(mod);

  document.getElementById("reg-name").value     = "Aluna Teste";
  document.getElementById("reg-email").value    = "aluna@example.com";
  document.getElementById("reg-password").value = "12345678";
  document.getElementById("reg-confirm").value  = "12345678";
  document.getElementById("reg-terms").checked  = true;
  await clickAndWait(document.getElementById("btn-register"));

  // "duplicate" routes to the database category's own duplicate message —
  // still centralized classification, never the raw constraint-violation text.
  assert.strictEqual(
    document.getElementById("register-error").textContent,
    "Já existe um registro com essas informações."
  );
});

test("password recovery (forgot password): rate limit error shows the shared rate-limit message", async (t) => {
  const mod = await loadAuthView(t, {
    sendPasswordReset: async () => {
      throw authApiError("For security purposes, you can only request this after 57 seconds.", { status: 429 });
    },
  });
  initView(mod);

  document.getElementById("forgot-email").value = "aluna@example.com";
  await clickAndWait(document.getElementById("btn-send-reset"));

  assert.strictEqual(
    document.getElementById("forgot-error").textContent,
    "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente."
  );
});

test("password recovery (forgot password): network error shows the shared network message", async (t) => {
  const mod = await loadAuthView(t, {
    sendPasswordReset: async () => { throw new Error("NetworkError when attempting to fetch resource"); },
  });
  initView(mod);

  document.getElementById("forgot-email").value = "aluna@example.com";
  await clickAndWait(document.getElementById("btn-send-reset"));

  assert.match(document.getElementById("forgot-error").textContent, /Sem conexão/);
});

test("password recovery (forgot password): unclassifiable error falls back to the screen-specific text, not a raw Supabase message", async (t) => {
  const mod = await loadAuthView(t, {
    sendPasswordReset: async () => { throw new Error("unexpected_failure"); },
  });
  initView(mod);

  document.getElementById("forgot-email").value = "aluna@example.com";
  await clickAndWait(document.getElementById("btn-send-reset"));

  assert.strictEqual(
    document.getElementById("forgot-error").textContent,
    "Não foi possível enviar o link. Tente novamente."
  );
});

test("set new password (troca de senha): expired/invalid recovery link (refresh inválido) shows the session-expired message", async (t) => {
  const mod = await loadAuthView(t, {
    updatePassword: async () => { throw authApiError("Invalid Refresh Token: Refresh Token Not Found", { code: "refresh_token_not_found" }); },
  });
  initView(mod);

  document.getElementById("new-password").value         = "12345678";
  document.getElementById("new-password-confirm").value = "12345678";
  await clickAndWait(document.getElementById("btn-set-password"));

  assert.strictEqual(
    document.getElementById("new-pwd-error").textContent,
    "Sua sessão expirou. Faça login novamente."
  );
});

test("set new password (troca de senha): server error shows the shared server message", async (t) => {
  const mod = await loadAuthView(t, {
    updatePassword: async () => { throw Object.assign(new Error("internal error"), { code: "23503" }); },
  });
  initView(mod);

  document.getElementById("new-password").value         = "12345678";
  document.getElementById("new-password-confirm").value = "12345678";
  await clickAndWait(document.getElementById("btn-set-password"));

  assert.strictEqual(
    document.getElementById("new-pwd-error").textContent,
    "Erro ao comunicar com o servidor. Tente novamente em instantes."
  );
});

test("set new password (troca de senha): golden path clears the form and returns to login", async (t) => {
  const mod = await loadAuthView(t, {
    updatePassword: async () => ({ user: { id: "user-1" } }),
  });
  initView(mod);

  document.getElementById("new-password").value         = "12345678";
  document.getElementById("new-password-confirm").value = "12345678";
  await clickAndWait(document.getElementById("btn-set-password"));

  assert.strictEqual(document.getElementById("view-login").hidden, false);
});
