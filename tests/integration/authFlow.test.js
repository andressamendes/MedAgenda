/**
 * Golden path: Login / Logout — authView.js wired to a mocked auth.js,
 * exercised through the real DOM (login form → app screen → sign out).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const AUTH_SPECIFIER      = new URL("../../auth.js", import.meta.url).href;
const WEEK_VIEW_SPECIFIER = new URL("../../weekView.js", import.meta.url).href;

// authView.js sets a real 10s "safety timer" (in case neither
// onAuthStateChange nor getSession() ever resolve) that is only cleared once
// onAuthStateChange fires. In the failure-path tests below that callback is
// never invoked, so the real timer would otherwise keep the test process
// alive for 10s. Fake timers make it harmless without touching production
// code; plain microtask flushing (unaffected by fake timers) replaces the
// setTimeout(0) flush idiom used in the golden-path tests.
async function flushMicrotasks(times = 15) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

function mockAuth(t, { failLoginMessage } = {}) {
  const calls = [];
  let authStateCallback = null;

  t.mock.module(AUTH_SPECIFIER, {
    namedExports: {
      signIn: async (email, password) => {
        calls.push({ fn: "signIn", email, password });
        // A1.2: erros reais do auth-js do Supabase sempre carregam
        // `__isAuthError: true` (ver authError.js) — é esse sinal estruturado,
        // nunca a mensagem, que errorService.categorize() usa para
        // classificar como 'auth'.
        if (failLoginMessage) {
          throw Object.assign(new Error(failLoginMessage), {
            name: "AuthApiError",
            __isAuthError: true,
            status: 400,
          });
        }
        const session = { user: { id: "user-123", email } };
        authStateCallback?.(session, "SIGNED_IN");
        return session;
      },
      signOut: async () => {
        calls.push({ fn: "signOut" });
        authStateCallback?.(null, "SIGNED_OUT");
      },
      getSession: async () => null,
      onAuthStateChange: (cb) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signUp: async () => ({ user: {} }),
      sendPasswordReset: async () => {},
      updatePassword: async () => ({}),
      parseAuthRedirectError: () => null,
      hasRecoveryIntent: () => false,
      clearAuthRedirectParams: () => {},
    },
  });

  // authView.js only needs destroyWeekView() from weekView.js, which itself
  // transitively imports Supabase — irrelevant to the login/logout flow.
  t.mock.module(WEEK_VIEW_SPECIFIER, { namedExports: { destroyWeekView: () => {}, destroyDayView: () => {} } });

  return calls;
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
});

test("golden path: successful login shows the app screen and clears the password field", async (t) => {
  mockAuth(t);
  const { initAuthView } = await import(`../../authView.js?t=${Math.random()}`);

  let signedInSession = null;
  initAuthView({ onSignedIn: async (session) => { signedInSession = session; } });
  await new Promise(r => setTimeout(r, 0)); // let the initial getSession() IIFE settle

  document.getElementById("email").value = "aluna@example.com";
  document.getElementById("password").value = "senha-correta";
  document.getElementById("btn-login").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("login-screen").hidden, true);
  assert.strictEqual(document.getElementById("app-screen").hidden, false);
  assert.strictEqual(document.getElementById("password").value, "");
  assert.strictEqual(signedInSession.user.id, "user-123");
});

test("failed login shows a friendly error and re-enables the login button", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  mockAuth(t, { failLoginMessage: "Invalid login credentials" });
  const { initAuthView } = await import(`../../authView.js?t=${Math.random()}`);
  initAuthView({});
  await flushMicrotasks();

  document.getElementById("email").value = "aluna@example.com";
  document.getElementById("password").value = "senha-errada";
  document.getElementById("btn-login").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flushMicrotasks();

  assert.strictEqual(
    document.getElementById("error-msg").textContent,
    "E-mail ou senha incorretos. Verifique suas credenciais."
  );
  assert.strictEqual(document.getElementById("btn-login").disabled, false);
  assert.strictEqual(document.getElementById("app-screen").hidden, true);
});

test("submitting the login form with empty fields shows a validation error without calling signIn", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = mockAuth(t);
  const { initAuthView } = await import(`../../authView.js?t=${Math.random()}`);
  initAuthView({});
  await flushMicrotasks();

  document.getElementById("btn-login").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flushMicrotasks();

  assert.strictEqual(document.getElementById("error-msg").textContent, "Preencha e-mail e senha.");
  assert.strictEqual(calls.some(c => c.fn === "signIn"), false);
});

// ── F4.1 — Fluxo Unificado de Sessão Expirada ───────────────────────────────
// forceReauth() é o fluxo oficial que stateView.js aciona (via
// setReauthHandler, ver script.js) sempre que qualquer tela detecta uma
// sessão expirada — nunca uma tela de erro específica por página.

test("forceReauth() signs out and shows the login screen", async (t) => {
  const calls = mockAuth(t);
  const { initAuthView, forceReauth } = await import(`../../authView.js?t=${Math.random()}`);
  initAuthView({ onSignedIn: async () => {} });
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("email").value = "aluna@example.com";
  document.getElementById("password").value = "senha-correta";
  document.getElementById("btn-login").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("app-screen").hidden, false);

  await forceReauth();

  assert.strictEqual(document.getElementById("login-screen").hidden, false);
  assert.strictEqual(document.getElementById("app-screen").hidden, true);
  assert.ok(calls.some(c => c.fn === "signOut"));
});

test("forceReauth() still shows the login screen even if signOut() itself fails (never leaves the user stuck)", async (t) => {
  t.mock.module(AUTH_SPECIFIER, {
    namedExports: {
      signIn: async () => ({ user: { id: "user-123" } }),
      signOut: async () => { throw new Error("network down"); },
      getSession: async () => null,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signUp: async () => ({ user: {} }),
      sendPasswordReset: async () => {},
      updatePassword: async () => ({}),
      parseAuthRedirectError: () => null,
      hasRecoveryIntent: () => false,
      clearAuthRedirectParams: () => {},
    },
  });
  t.mock.module(WEEK_VIEW_SPECIFIER, { namedExports: { destroyWeekView: () => {}, destroyDayView: () => {} } });

  const { initAuthView, forceReauth } = await import(`../../authView.js?t=${Math.random()}`);
  initAuthView({});
  await new Promise(r => setTimeout(r, 0));

  await forceReauth();

  assert.strictEqual(document.getElementById("login-screen").hidden, false);
  assert.strictEqual(document.getElementById("app-screen").hidden, true);
});

test("golden path: logout returns to the login screen and runs onBeforeSignOut", async (t) => {
  mockAuth(t);
  const { initAuthView } = await import(`../../authView.js?t=${Math.random()}`);

  let beforeSignOutCalled = false;
  initAuthView({
    onSignedIn: async () => {},
    onBeforeSignOut: () => { beforeSignOutCalled = true; },
  });
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("email").value = "aluna@example.com";
  document.getElementById("password").value = "senha-correta";
  document.getElementById("btn-login").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("app-screen").hidden, false);

  document.getElementById("btn-logout").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("login-screen").hidden, false);
  assert.strictEqual(document.getElementById("app-screen").hidden, true);
  assert.strictEqual(beforeSignOutCalled, true);
});
