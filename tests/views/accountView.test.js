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

function loadAccountView(t, { profile, onGetProfile } = {}) {
  t.mock.module(SUPABASE_SPECIFIER, { namedExports: { supabase: createSupabaseMock() } });
  t.mock.module(AUTH_SPECIFIER, { namedExports: { updatePassword: async () => ({}) } });
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
