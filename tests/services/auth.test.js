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
