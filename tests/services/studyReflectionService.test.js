/**
 * Tests for studyReflectionService.js — CRUD puro contra Supabase mockado
 * (F8.2). Supabase é totalmente mockado: sem rede, sem projeto real.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

function loadStudyReflectionService(t, tableResponses) {
  const supabase = createSupabaseMock({ tableResponses });
  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: {
      supabase,
      currentUserId: async () => "user-123",
    },
  });
  return import(`../../studyReflectionService.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

// ── getBySession() ───────────────────────────────────────────────────────

test("getBySession() exige sessionId", async (t) => {
  const { mod } = await loadStudyReflectionService(t, {});

  await assert.rejects(
    () => mod.getBySession(null),
    (err) => err.code === "SESSION_ID_REQUIRED"
  );
});

test("getBySession() escopa a busca por session_id + user_id e retorna a linha", async (t) => {
  const row = { id: "refl-1", session_id: "sess-1", content: "Aprendi arritmias." };
  const { mod, supabase } = await loadStudyReflectionService(t, {
    reflections: { data: row, error: null },
  });

  const result = await mod.getBySession("sess-1");

  assert.deepStrictEqual(result, row);
  const eqCalls = supabase._calls.filter(c => c.table === "reflections" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["user_id", "user-123"], ["session_id", "sess-1"]]);
});

test("getBySession() retorna null quando a sessão ainda não tem reflexão", async (t) => {
  const { mod } = await loadStudyReflectionService(t, {
    reflections: { data: null, error: null },
  });

  const result = await mod.getBySession("sess-1");

  assert.strictEqual(result, null);
});

test("getBySession() propaga erro do Supabase", async (t) => {
  const { mod } = await loadStudyReflectionService(t, {
    reflections: { data: null, error: { message: "select failed" } },
  });

  await assert.rejects(
    () => mod.getBySession("sess-1"),
    (err) => err.message === "select failed"
  );
});

// ── saveReflection() ─────────────────────────────────────────────────────

test("saveReflection() exige sessionId", async (t) => {
  const { mod } = await loadStudyReflectionService(t, {});

  await assert.rejects(
    () => mod.saveReflection(null, "texto"),
    (err) => err.code === "SESSION_ID_REQUIRED"
  );
});

test("saveReflection() rejeita conteúdo vazio ou só espaços", async (t) => {
  const { mod } = await loadStudyReflectionService(t, {});

  await assert.rejects(
    () => mod.saveReflection("sess-1", "   "),
    (err) => err.code === "CONTENT_REQUIRED"
  );
});

test("saveReflection() faz upsert por session_id com o user_id atual e retorna a linha salva", async (t) => {
  const saved = { id: "refl-1", session_id: "sess-1", user_id: "user-123", content: "Aprendi arritmias." };
  const { mod, supabase } = await loadStudyReflectionService(t, {
    reflections: { data: saved, error: null },
  });

  const result = await mod.saveReflection("sess-1", "  Aprendi arritmias.  ");

  assert.deepStrictEqual(result, saved);
  const upsertCall = supabase._calls.find(c => c.table === "reflections" && c.method === "upsert");
  assert.deepStrictEqual(upsertCall.args[0], { session_id: "sess-1", user_id: "user-123", content: "Aprendi arritmias." });
  assert.deepStrictEqual(upsertCall.args[1], { onConflict: "session_id" });
});

test("saveReflection() propaga erro do Supabase", async (t) => {
  const { mod } = await loadStudyReflectionService(t, {
    reflections: { data: null, error: { message: "upsert failed" } },
  });

  await assert.rejects(
    () => mod.saveReflection("sess-1", "texto"),
    (err) => err.message === "upsert failed"
  );
});
