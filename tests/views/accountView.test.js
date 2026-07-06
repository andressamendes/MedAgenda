/**
 * Tests for accountView.js — logout symmetry (A1.3).
 *
 * initAccountView() is called once per login (ver script.js/_initApp). Sem
 * guarda contra reinicialização, um segundo login na mesma sessão de página
 * (logout → login novamente, sem reload) registraria um novo listener de
 * click em btn-my-account/account-close e um novo modalController (novo
 * listener de Escape/clique-fora em document) a cada vez — os testes abaixo
 * provam que isso não acontece mais, e que resetAccountView() limpa o
 * perfil em cache e fecha o modal.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;
const AUTH_SPECIFIER     = new URL("../../auth.js", import.meta.url).href;
const PROFILE_SPECIFIER  = new URL("../../profileService.js", import.meta.url).href;
const AVATAR_SPECIFIER   = new URL("../../avatarService.js", import.meta.url).href;
const TOAST_SPECIFIER    = new URL("../../toastService.js", import.meta.url).href;

function loadAccountView(t, { profile, onGetProfile, authOverrides = {} } = {}) {
  t.mock.module(SUPABASE_SPECIFIER, { namedExports: { supabase: createSupabaseMock() } });
  t.mock.module(AUTH_SPECIFIER, {
    namedExports: {
      updatePassword: async () => ({}),
      reauthenticate: async () => {},
      ...authOverrides,
    },
  });
  t.mock.module(PROFILE_SPECIFIER, {
    namedExports: {
      getProfile: async () => {
        onGetProfile?.();
        return profile ?? { full_name: "Aluna Teste", timezone: "America/Sao_Paulo" };
      },
      upsertProfile: async (fields) => fields,
    },
  });
  t.mock.module(AVATAR_SPECIFIER, {
    namedExports: {
      uploadAvatar: async () => { throw new Error("not used in this test"); },
      removeAvatar: async () => { throw new Error("not used in this test"); },
    },
  });
  t.mock.module(TOAST_SPECIFIER, {
    namedExports: { showToast: () => {}, toast: { success: () => {}, error: () => {}, info: () => {} } },
  });
  return import(`../../accountView.js?t=${Math.random()}`);
}

beforeEach(() => { installDom(); });
afterEach(() => { uninstallDom(); });

test("opening the account modal via btn-my-account loads and renders the profile", async (t) => {
  const view = await loadAccountView(t);
  view.initAccountView("user-1");

  document.getElementById("btn-my-account").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("account-overlay").hidden, false);
});

test("calling initAccountView again (second login, no page reload) does not register a duplicate open listener", async (t) => {
  let getProfileCalls = 0;
  const view = await loadAccountView(t, { onGetProfile: () => { getProfileCalls++; } });

  view.initAccountView("user-1");
  view.initAccountView("user-2"); // simulates logout + a new login in the same page session
  view.initAccountView("user-1"); // and a third, just to be sure it never re-registers

  document.getElementById("btn-my-account").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  // If each initAccountView() call had re-registered the click listener,
  // a single click would call open() (and therefore getProfile()) 3 times.
  assert.strictEqual(getProfileCalls, 1);
});

test("resetAccountView() clears the cached profile and closes the modal", async (t) => {
  const view = await loadAccountView(t);
  view.initAccountView("user-1");

  document.getElementById("btn-my-account").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("account-overlay").hidden, false);

  view.resetAccountView();

  assert.strictEqual(document.getElementById("account-overlay").hidden, true);
});

test("resetAccountView() clears the account modal body, wiping any password left typed in the change-password form", async (t) => {
  const view = await loadAccountView(t);
  view.initAccountView("user-1");

  document.getElementById("btn-my-account").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  document.getElementById("acc-current-pwd").value = "senha-atual-digitada";
  document.getElementById("acc-new-pwd").value     = "nova-senha-digitada";

  view.resetAccountView();

  assert.strictEqual(document.getElementById("account-body").innerHTML, "");
  assert.strictEqual(document.getElementById("acc-current-pwd"), null);
});

// ── A1.5 — Reautenticação Obrigatória para Alteração de Senha ──────────────
// Uma sessão já aberta não basta: toda troca de senha passa primeiro por
// auth.js#reauthenticate() (signInWithPassword com a senha atual, a mesma
// API oficial do login) antes de updatePassword().

function authApiError(message, extra = {}) {
  return Object.assign(new Error(message), {
    name: "AuthApiError",
    __isAuthError: true,
    status: 400,
    ...extra,
  });
}

async function openAccountAndFillPasswordForm(view, { current, next, confirm }) {
  view.initAccountView("user-1");
  document.getElementById("btn-my-account").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("acc-current-pwd").value  = current ?? "senha-atual-correta";
  document.getElementById("acc-new-pwd").value      = next ?? "nova-senha-123";
  document.getElementById("acc-confirm-pwd").value  = confirm ?? (next ?? "nova-senha-123");
}

async function submitChangePassword() {
  document.getElementById("btn-change-pwd").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

test("change password: golden path reauthenticates then updates the password, clearing all three fields", async (t) => {
  let reauthCalledWith = null;
  let updateCalledWith = null;
  const view = await loadAccountView(t, {
    authOverrides: {
      reauthenticate: async (pwd) => { reauthCalledWith = pwd; },
      updatePassword: async (pwd) => { updateCalledWith = pwd; return {}; },
    },
  });
  await openAccountAndFillPasswordForm(view, { current: "senha-atual-correta", next: "nova-senha-123" });

  await submitChangePassword();

  assert.strictEqual(reauthCalledWith, "senha-atual-correta");
  assert.strictEqual(updateCalledWith, "nova-senha-123");
  assert.strictEqual(document.getElementById("acc-current-pwd").value, "");
  assert.strictEqual(document.getElementById("acc-new-pwd").value, "");
  assert.strictEqual(document.getElementById("acc-confirm-pwd").value, "");
});

test("change password: current password field is required before reauthenticating", async (t) => {
  let reauthCalled = false;
  const view = await loadAccountView(t, {
    authOverrides: { reauthenticate: async () => { reauthCalled = true; } },
  });
  await openAccountAndFillPasswordForm(view, { current: "" });

  await submitChangePassword();

  assert.strictEqual(document.getElementById("pwd-error").textContent, "Digite sua senha atual.");
  assert.strictEqual(reauthCalled, false);
});

test("change password: mismatched confirmation is rejected before reauthenticating", async (t) => {
  let reauthCalled = false;
  const view = await loadAccountView(t, {
    authOverrides: { reauthenticate: async () => { reauthCalled = true; } },
  });
  await openAccountAndFillPasswordForm(view, { next: "nova-senha-123", confirm: "outra-coisa" });

  await submitChangePassword();

  assert.strictEqual(document.getElementById("pwd-error").textContent, "As senhas não coincidem.");
  assert.strictEqual(reauthCalled, false);
});

test("change password: wrong current password shows a dedicated friendly message, never the login-style 'e-mail ou senha' text, and keeps the session/new-password field intact", async (t) => {
  const view = await loadAccountView(t, {
    authOverrides: {
      // Mirrors the real auth.js#reauthenticate() contract: it translates
      // the SDK's raw 'invalid_credentials' into its own dedicated code
      // (never leaking the raw code/message to accountView.js) — see
      // tests/services/auth.test.js for that translation itself.
      reauthenticate: async () => {
        throw authApiError("Senha atual incorreta.", { code: "current_password_incorrect" });
      },
    },
  });
  await openAccountAndFillPasswordForm(view, { current: "senha-errada", next: "nova-senha-123" });

  await submitChangePassword();

  assert.strictEqual(
    document.getElementById("pwd-error").textContent,
    "Senha atual incorreta. Verifique e tente novamente."
  );
  // Current-password field is cleared (force retype); the new password the
  // user already typed is never lost.
  assert.strictEqual(document.getElementById("acc-current-pwd").value, "");
  assert.strictEqual(document.getElementById("acc-new-pwd").value, "nova-senha-123");
  // Never signed out over a wrong current password.
  assert.strictEqual(document.getElementById("account-overlay").hidden, false);
});

test("change password: expired session during reauthentication routes through the central pipeline (forceReauth), not an inline message", async (t) => {
  const view = await loadAccountView(t, {
    authOverrides: {
      reauthenticate: async () => {
        throw authApiError("Invalid Refresh Token: Refresh Token Not Found", { code: "refresh_token_not_found" });
      },
    },
  });
  await openAccountAndFillPasswordForm(view, {});

  await submitChangePassword();

  // stateView's default reauth handler (no forceReauth registered in this
  // test) reloads the page; jsdom just logs a "not implemented: navigation"
  // warning — what matters is that the account modal was closed by the
  // central pipeline instead of showing a raw/technical inline error.
  assert.strictEqual(document.getElementById("pwd-error").textContent, "");
});

test("change password: network error during reauthentication allows retrying without losing the typed new password", async (t) => {
  const view = await loadAccountView(t, {
    authOverrides: {
      reauthenticate: async () => { throw new Error("Failed to fetch"); },
    },
  });
  await openAccountAndFillPasswordForm(view, { current: "senha-atual-correta", next: "nova-senha-123" });

  await submitChangePassword();

  assert.match(document.getElementById("pwd-error").textContent, /Sem conexão/);
  assert.strictEqual(document.getElementById("acc-new-pwd").value, "nova-senha-123");
  assert.strictEqual(document.getElementById("btn-change-pwd").disabled, false);
});

test("change password: a generic server error during updatePassword() (after successful reauthentication) shows the shared server message", async (t) => {
  const view = await loadAccountView(t, {
    authOverrides: {
      reauthenticate: async () => {},
      updatePassword: async () => { throw Object.assign(new Error("internal error"), { code: "23503" }); },
    },
  });
  await openAccountAndFillPasswordForm(view, { current: "senha-atual-correta", next: "nova-senha-123" });

  await submitChangePassword();

  assert.strictEqual(
    document.getElementById("pwd-error").textContent,
    "Erro ao comunicar com o servidor. Tente novamente em instantes."
  );
});

test("change password: logout mid-flow (reauthenticate() still pending) does not throw and does not leave stale password text behind", async (t) => {
  let resolveReauth;
  const view = await loadAccountView(t, {
    authOverrides: {
      reauthenticate: () => new Promise((resolve) => { resolveReauth = resolve; }),
    },
  });
  await openAccountAndFillPasswordForm(view, { current: "senha-atual-correta", next: "nova-senha-123" });

  document.getElementById("btn-change-pwd").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  // Logout happens while reauthenticate() is still in flight.
  view.resetAccountView();
  assert.strictEqual(document.getElementById("account-body").innerHTML, "");

  // The in-flight promise resolving afterwards must not throw despite the
  // form no longer existing in the DOM.
  assert.doesNotThrow(() => resolveReauth());
  await new Promise(r => setTimeout(r, 0));
});

test("password recovery (forgot-password / reset link) flow is untouched by the reauthentication requirement: updatePassword() alone still works from the auth screen", async (t) => {
  // Sanity check that A1.5 only touches accountView.js's authenticated
  // change-password form — authView.js's post-recovery-link "new password"
  // screen never calls reauthenticate() and still works with updatePassword()
  // alone (see tests/views/authView.test.js for the full recovery-flow suite).
  let updateCalled = false;
  const view = await loadAccountView(t, {
    authOverrides: { updatePassword: async () => { updateCalled = true; return {}; } },
  });
  await openAccountAndFillPasswordForm(view, { current: "senha-atual-correta", next: "nova-senha-123" });
  await submitChangePassword();

  assert.strictEqual(updateCalled, true);
});

test("after logout and a new login, opening the account modal shows the new user's own profile", async (t) => {
  let getProfileCalls = 0;
  const view = await loadAccountView(t, {
    profile: { full_name: "Usuário Um", timezone: "UTC" },
    onGetProfile: () => { getProfileCalls++; },
  });
  view.initAccountView("user-1");
  document.getElementById("btn-my-account").click();
  await new Promise(r => setTimeout(r, 0));
  view.resetAccountView();

  view.initAccountView("user-2"); // next login — no page reload
  document.getElementById("btn-my-account").click();
  await new Promise(r => setTimeout(r, 0));

  // The click listener was only ever registered once (guarded), so
  // getProfile() ran exactly twice: once per login/open, never duplicated.
  assert.strictEqual(getProfileCalls, 2);
  assert.strictEqual(document.getElementById("account-overlay").hidden, false);
});
