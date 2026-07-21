/**
 * Tests for activitySessionService.js — CRUD against Supabase.
 * Supabase is fully mocked: no network, no real project required.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";
import { SESSION_EVENTS, subscribe } from "../../sessionEventBus.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

function loadActivitySessionService(t, tableResponses) {
  const supabase = createSupabaseMock({ tableResponses });
  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: {
      supabase,
      currentUserId: async () => "user-123",
    },
  });
  return import(`../../activitySessionService.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

test("createActivitySession() inserts with the current user's id and returns the created row", async (t) => {
  const created = { id: "sess-1", status: "running", user_id: "user-123" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: created, error: null },
  });

  const result = await mod.createActivitySession({ status: "running", source: "manual" });

  assert.deepStrictEqual(result, created);
  const insertCall = supabase._calls.find(c => c.method === "insert");
  assert.strictEqual(insertCall.args[0].user_id, "user-123");
  assert.strictEqual(insertCall.args[0].status, "running");
});

test("createActivitySession() propagates a Supabase error", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: { message: "insert failed" } },
  });

  await assert.rejects(
    () => mod.createActivitySession({ status: "running" }),
    (err) => err.message === "insert failed"
  );
});

test("getActivitySessionById() scopes the lookup to id + user_id and returns the row", async (t) => {
  const row = { id: "sess-1", status: "running" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: row, error: null },
  });

  const result = await mod.getActivitySessionById("sess-1");

  assert.deepStrictEqual(result, row);
  const eqCalls = supabase._calls.filter(c => c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "sess-1"], ["user_id", "user-123"]]);
});

test("getActivitySessionById() returns null when no row matches, without throwing", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: null },
  });

  const result = await mod.getActivitySessionById("sess-missing");

  assert.strictEqual(result, null);
});

test("getActivitySessions() returns rows scoped to the current user, most recent first", async (t) => {
  const rows = [{ id: "sess-2" }, { id: "sess-1" }];
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null },
  });

  const result = await mod.getActivitySessions();

  assert.deepStrictEqual(result, rows);
  const eqCall = supabase._calls.find(c => c.method === "eq");
  assert.deepStrictEqual(eqCall.args, ["user_id", "user-123"]);
  const orderCall = supabase._calls.find(c => c.method === "order");
  assert.deepStrictEqual(orderCall.args, ["started_at", { ascending: false }]);
});

test("updateActivitySession() scopes the update to id + user_id and returns the updated row", async (t) => {
  const updated = { id: "sess-1", status: "finished" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: updated, error: null },
  });

  const result = await mod.updateActivitySession("sess-1", { status: "finished" });

  assert.deepStrictEqual(result, updated);
  const eqCalls = supabase._calls.filter(c => c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "sess-1"], ["user_id", "user-123"]]);
});

test("deleteActivitySession() scopes the delete to id + user_id", async (t) => {
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: null },
  });

  await mod.deleteActivitySession("sess-1");

  const eqCalls = supabase._calls.filter(c => c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "sess-1"], ["user_id", "user-123"]]);
});

test("deleteActivitySession() throws when Supabase reports an error", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: { message: "not found" } },
  });

  await assert.rejects(
    () => mod.deleteActivitySession("sess-missing"),
    (err) => err.message === "not found"
  );
});

// ── Domínio ──────────────────────────────────────────────────────────────

test("getRunningSession() returns null when there is no running session", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: null },
  });

  assert.strictEqual(await mod.getRunningSession(), null);
});

// ── F7.8 — Recuperação e continuidade da sessão ─────────────────────────────

test("getActiveSession() returns null when there is no running/paused session", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: [], error: null },
  });

  assert.strictEqual(await mod.getActiveSession(), null);
});

test("getActiveSession() scopes the query to running/paused, most recent first", async (t) => {
  const row = { id: "sess-1", status: "paused", started_at: "2026-01-01T10:00:00.000Z" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: [row], error: null },
  });

  const result = await mod.getActiveSession();

  assert.deepStrictEqual(result, row);
  const inCall = supabase._calls.find(c => c.method === "in");
  assert.deepStrictEqual(inCall.args, ["status", ["running", "paused"]]);
  const orderCall = supabase._calls.find(c => c.method === "order");
  assert.deepStrictEqual(orderCall.args, ["started_at", { ascending: false }]);
});

test("getActiveSession() returns a running session unchanged (F7.7 continuity fields intact)", async (t) => {
  const row = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z", paused_ms: 60000, paused_at: null };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: [row], error: null },
  });

  assert.deepStrictEqual(await mod.getActiveSession(), row);
});

test("startSession() creates a running session when none is active", async (t) => {
  const created = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    // 1ª chamada: getRunningSession() -> nenhuma sessão ativa
    // 2ª chamada: createActivitySession() -> insere e retorna a criada
    activity_sessions: [{ data: null, error: null }, { data: created, error: null }],
  });

  const result = await mod.startSession({ source: "manual" });

  assert.deepStrictEqual(result, created);
  const insertCall = supabase._calls.find(c => c.method === "insert");
  assert.strictEqual(insertCall.args[0].status, "running");
  assert.strictEqual(insertCall.args[0].source, "manual");
  assert.ok(insertCall.args[0].started_at);
});

test("startSession() refuses to start a second session while one is already running", async (t) => {
  const running = { id: "sess-running", status: "running" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: running, error: null },
  });

  await assert.rejects(
    () => mod.startSession({}),
    (err) => err.code === "SESSION_ALREADY_RUNNING" && err.message.includes("Já existe")
  );
});

// AUD-001 — corrida entre duas abas: getRunningSession() de ambas as chamadas
// já passou (nenhuma via a outra) antes do INSERT concorrente ser confirmado;
// só o índice único parcial do banco (sql/19_activity_sessions_running_unique.sql)
// rejeita a segunda. Simula a violação como o Postgres/Supabase a reportam
// (error.code 23505 + nome do índice na mensagem) e confirma que startSession()
// converte isso no mesmo erro de domínio do caminho síncrono, sem propagar
// detalhes de SQL/constraint para quem chamou.
test("startSession() converts a unique-constraint race into the standard SESSION_ALREADY_RUNNING error", async (t) => {
  const constraintError = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "activity_sessions_one_running_per_user"',
  };
  const { mod, supabase } = await loadActivitySessionService(t, {
    // 1ª chamada: getRunningSession() -> nenhuma sessão ativa (nesta aba)
    // 2ª chamada: createActivitySession() -> banco rejeita por corrida com outra aba
    activity_sessions: [{ data: null, error: null }, { data: null, error: constraintError }],
  });

  await assert.rejects(
    () => mod.startSession({}),
    (err) =>
      err.code === "SESSION_ALREADY_RUNNING"
      && err.message === "Já existe uma sessão de atividade em andamento. Finalize ou cancele-a antes de iniciar uma nova."
      && !("sqlState" in err)
  );
  // Nenhuma sessão parcial fica "meio criada" — o INSERT falhou no banco, não há linha a limpar.
  assert.strictEqual(supabase._calls.filter(c => c.method === "insert").length, 1);
});

test("startSession() re-throws unrelated Supabase errors untouched (not every 23505 is this constraint)", async (t) => {
  const unrelatedError = { code: "23505", message: 'duplicate key value violates unique constraint "reflections_session_id_unique"' };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: null, error: null }, { data: null, error: unrelatedError }],
  });

  await assert.rejects(
    () => mod.startSession({}),
    (err) => err.code === "23505" && err.message === unrelatedError.message
  );
});

test("finishSession() sets ended_at, status and computes duration_minutes", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const updated = { ...session, status: "finished", duration_minutes: 30 };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: [updated], error: null }],
  });

  const result = await mod.finishSession("sess-1", new Date("2026-01-01T10:30:00.000Z"));

  assert.deepStrictEqual(result, updated);
  const updateCall = supabase._calls.find(c => c.method === "update");
  assert.strictEqual(updateCall.args[0].status, "finished");
  assert.strictEqual(updateCall.args[0].duration_minutes, 30);
  assert.strictEqual(updateCall.args[0].ended_at, "2026-01-01T10:30:00.000Z");
});

// F10 #3.4 — a tela "Sessão concluída" foi removida; para que as Observações
// digitadas no resumo de encerramento continuem visíveis em algum lugar (o
// Diário de Estudos já as exibe via `session.notes`, ver studyJournalView.js/
// _buildEntryEl), finishSession() passou a persistir o argumento `notes` na
// coluna `activity_sessions.notes` (já existente desde sql/11_activity_sessions.sql,
// nunca antes escrita por este service).
test("finishSession() persists the trimmed notes argument in activity_sessions.notes", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const updated = { ...session, status: "finished", duration_minutes: 30, notes: "Revisar arritmias amanhã." };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: [updated], error: null }],
  });

  await mod.finishSession("sess-1", new Date("2026-01-01T10:30:00.000Z"), "  Revisar arritmias amanhã.  ");

  const updateCall = supabase._calls.find(c => c.method === "update");
  assert.strictEqual(updateCall.args[0].notes, "Revisar arritmias amanhã.");
});

test("finishSession() never writes a blank/whitespace-only notes argument (leaves the column untouched)", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const updated = { ...session, status: "finished", duration_minutes: 30 };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: [updated], error: null }],
  });

  await mod.finishSession("sess-1", new Date("2026-01-01T10:30:00.000Z"), "   ");

  const updateCall = supabase._calls.find(c => c.method === "update");
  assert.strictEqual("notes" in updateCall.args[0], false);
});

test("finishSession() omits notes entirely when called without the argument (existing callers unaffected)", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const updated = { ...session, status: "finished", duration_minutes: 30 };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: [updated], error: null }],
  });

  await mod.finishSession("sess-1", new Date("2026-01-01T10:30:00.000Z"));

  const updateCall = supabase._calls.find(c => c.method === "update");
  assert.strictEqual("notes" in updateCall.args[0], false);
});

test("finishSession() deducts paused_ms (already-completed pauses) from duration_minutes", async (t) => {
  const session = {
    id: "sess-1",
    status: "running",
    started_at: "2026-01-01T10:00:00.000Z",
    paused_ms: 10 * 60000, // 10 minutos já pausados, acumulados numa pausa/retomada anterior
  };
  const updated = { ...session, status: "finished", duration_minutes: 20 };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: [updated], error: null }],
  });

  await mod.finishSession("sess-1", new Date("2026-01-01T10:30:00.000Z"));

  const updateCall = supabase._calls.find(c => c.method === "update");
  // 30 minutos de relógio - 10 minutos pausados = 20 minutos líquidos.
  assert.strictEqual(updateCall.args[0].duration_minutes, 20);
});

test("finishSession() also deducts the current (still-open) pause interval when finishing directly from paused, without resuming first", async (t) => {
  const session = {
    id: "sess-1",
    status: "paused",
    started_at: "2026-01-01T10:00:00.000Z",
    paused_at: "2026-01-01T10:20:00.000Z", // pausou aos 20min, sem retomar
    paused_ms: 0,
  };
  const updated = { ...session, status: "finished", duration_minutes: 20 };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: [updated], error: null }],
  });

  await mod.finishSession("sess-1", new Date("2026-01-01T10:30:00.000Z"));

  const updateCall = supabase._calls.find(c => c.method === "update");
  // 30 minutos de relógio, mas os últimos 10 (20min->30min) estavam em pausa aberta.
  assert.strictEqual(updateCall.args[0].duration_minutes, 20);
  assert.strictEqual(updateCall.args[0].paused_at, null);
});

test("finishSession() rejects an end time earlier than the start (negative duration)", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:30:00.000Z" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: session, error: null },
  });

  await assert.rejects(
    () => mod.finishSession("sess-1", new Date("2026-01-01T10:00:00.000Z")),
    (err) => err.code === "INVALID_DURATION"
  );
});

test("finishSession() throws a domain error when the session doesn't exist", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: null },
  });

  await assert.rejects(
    () => mod.finishSession("sess-missing"),
    (err) => err.code === "SESSION_NOT_FOUND"
  );
});

test("finishSession() refuses to re-finish an already finished session", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-01-01T10:00:00.000Z" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: session, error: null },
  });

  await assert.rejects(
    () => mod.finishSession("sess-1"),
    (err) => err.code === "SESSION_ALREADY_ENDED"
  );
});

test("cancelSession() sets status to cancelled without deleting the row", async (t) => {
  const session = { id: "sess-1", status: "running" };
  const cancelled = { ...session, status: "cancelled" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: [cancelled], error: null }],
  });

  const result = await mod.cancelSession("sess-1");

  assert.deepStrictEqual(result, cancelled);
  assert.ok(!supabase._calls.some(c => c.method === "delete"));
  const updateCall = supabase._calls.find(c => c.method === "update");
  assert.strictEqual(updateCall.args[0].status, "cancelled");
});

test("cancelSession() refuses to cancel an already finished session", async (t) => {
  const session = { id: "sess-1", status: "finished" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: session, error: null },
  });

  await assert.rejects(
    () => mod.cancelSession("sess-1"),
    (err) => err.code === "SESSION_ALREADY_ENDED"
  );
});

// ── F15.8 — Guarda de estado nas transições (corrida entre abas) ────────────
// Simula a janela entre leitura e escrita: getActivitySessionById() ainda vê a
// sessão ativa, mas outra aba a encerra antes do UPDATE desta. O UPDATE
// condicional (.in("status", fromStatuses)) então não afeta nenhuma linha —
// o resultado deve ser o erro de domínio SESSION_STATE_CONFLICT, nunca uma
// segunda escrita sobrepondo ended_at/duration_minutes, e nenhum evento
// publicado no barramento.

test("finishSession() turns a lost race (0 rows updated) into SESSION_STATE_CONFLICT and publishes no event", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    // 1ª: getActivitySessionById() -> ainda "running" (nesta aba)
    // 2ª: UPDATE condicional -> 0 linhas (outra aba já encerrou)
    activity_sessions: [{ data: session, error: null }, { data: [], error: null }],
  });
  const events = [];
  const unsubscribers = Object.values(SESSION_EVENTS).map((type) =>
    subscribe(type, (payload) => events.push({ type, payload }))
  );
  t.after(() => unsubscribers.forEach((unsub) => unsub()));

  await assert.rejects(
    () => mod.finishSession("sess-1", new Date("2026-01-01T10:30:00.000Z")),
    (err) => err.code === "SESSION_STATE_CONFLICT" && err.message.includes("outra aba")
  );

  // O UPDATE foi condicionado ao status de origem e aconteceu uma única vez.
  const updateCalls = supabase._calls.filter(c => c.method === "update");
  assert.strictEqual(updateCalls.length, 1);
  const inCall = supabase._calls.find(c => c.method === "in");
  assert.deepStrictEqual(inCall.args, ["status", ["running", "paused"]]);
  assert.deepStrictEqual(events, []);
});

test("cancelSession() turns a lost race into SESSION_STATE_CONFLICT instead of overwriting the concurrent finish", async (t) => {
  const session = { id: "sess-1", status: "running" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: [], error: null }],
  });
  const events = [];
  const unsubscribers = Object.values(SESSION_EVENTS).map((type) =>
    subscribe(type, (payload) => events.push({ type, payload }))
  );
  t.after(() => unsubscribers.forEach((unsub) => unsub()));

  await assert.rejects(
    () => mod.cancelSession("sess-1"),
    (err) => err.code === "SESSION_STATE_CONFLICT"
  );

  const inCall = supabase._calls.find(c => c.method === "in");
  assert.deepStrictEqual(inCall.args, ["status", ["running", "paused"]]);
  assert.deepStrictEqual(events, []);
});

test("pauseSession() only updates sessions still running (guarded .in) and reports a lost race as SESSION_STATE_CONFLICT", async (t) => {
  const session = { id: "sess-1", status: "running" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: [], error: null }],
  });

  await assert.rejects(
    () => mod.pauseSession("sess-1"),
    (err) => err.code === "SESSION_STATE_CONFLICT"
  );

  const inCall = supabase._calls.find(c => c.method === "in");
  assert.deepStrictEqual(inCall.args, ["status", ["running"]]);
});

test("resumeSession() only updates sessions still paused (guarded .in) and reports a lost race as SESSION_STATE_CONFLICT", async (t) => {
  const session = { id: "sess-1", status: "paused", paused_at: "2026-07-09T12:00:00.000Z", paused_ms: 0 };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [
      { data: session, error: null }, // getActivitySessionById -> ainda "paused"
      { data: null, error: null },    // getRunningSession -> nenhuma outra ativa
      { data: [], error: null },      // UPDATE condicional -> 0 linhas (corrida perdida)
    ],
  });

  await assert.rejects(
    () => mod.resumeSession("sess-1"),
    (err) => err.code === "SESSION_STATE_CONFLICT"
  );

  const updateInCall = supabase._calls.find(c => c.method === "in" && c.args[1].includes("paused") && c.args[1].length === 1);
  assert.deepStrictEqual(updateInCall.args, ["status", ["paused"]]);
});

test("pauseSession() moves a running session to paused", async (t) => {
  const session = { id: "sess-1", status: "running" };
  const paused = { ...session, status: "paused", paused_at: "2026-07-09T12:00:00.000Z" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: [paused], error: null }],
  });

  const result = await mod.pauseSession("sess-1");

  assert.deepStrictEqual(result, paused);
  const updateCall = supabase._calls.find(c => c.method === "update");
  assert.strictEqual(updateCall.args[0].status, "paused");
  assert.strictEqual(typeof updateCall.args[0].paused_at, "string");
});

test("pauseSession() refuses to pause a session that isn't running", async (t) => {
  const session = { id: "sess-1", status: "paused" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: session, error: null },
  });

  await assert.rejects(
    () => mod.pauseSession("sess-1"),
    (err) => err.code === "INVALID_STATE"
  );
});

test("resumeSession() moves a paused session back to running", async (t) => {
  const session = { id: "sess-1", status: "paused", paused_at: "2026-07-09T12:00:00.000Z", paused_ms: 0 };
  const resumed = { ...session, status: "running", paused_at: null, paused_ms: 60000 };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [
      { data: session, error: null }, // getActivitySessionById
      { data: null, error: null },    // getRunningSession -> nenhuma outra ativa
      { data: [resumed], error: null }, // _transition (UPDATE condicional)
    ],
  });

  const result = await mod.resumeSession("sess-1");

  assert.deepStrictEqual(result, resumed);
  const updateCall = supabase._calls.find(c => c.method === "update");
  assert.strictEqual(updateCall.args[0].status, "running");
  assert.strictEqual(updateCall.args[0].paused_at, null);
  assert.strictEqual(typeof updateCall.args[0].paused_ms, "number");
});

test("resumeSession() refuses to resume when another session is already running", async (t) => {
  const session = { id: "sess-1", status: "paused" };
  const otherRunning = { id: "sess-2", status: "running" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: otherRunning, error: null }],
  });

  await assert.rejects(
    () => mod.resumeSession("sess-1"),
    (err) => err.code === "SESSION_ALREADY_RUNNING"
  );
});

// AUD-001 — mesma corrida de startSession(), agora entre resumeSession() de
// duas abas: ambas passam por getRunningSession() antes do UPDATE concorrente
// ser confirmado; o índice único parcial rejeita a segunda no banco.
test("resumeSession() converts a unique-constraint race into the standard SESSION_ALREADY_RUNNING error", async (t) => {
  const session = { id: "sess-1", status: "paused", paused_at: "2026-07-09T12:00:00.000Z", paused_ms: 0 };
  const constraintError = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "activity_sessions_one_running_per_user"',
  };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: [
      { data: session, error: null }, // getActivitySessionById
      { data: null, error: null },    // getRunningSession -> nenhuma outra ativa (nesta aba)
      { data: null, error: constraintError }, // updateActivitySession -> banco rejeita por corrida
    ],
  });

  await assert.rejects(
    () => mod.resumeSession("sess-1"),
    (err) =>
      err.code === "SESSION_ALREADY_RUNNING"
      && err.message === "Já existe uma sessão de atividade em andamento. Finalize ou cancele-a antes de retomar esta."
  );
});

test("resumeSession() refuses to resume a session that isn't paused", async (t) => {
  const session = { id: "sess-1", status: "running" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: session, error: null },
  });

  await assert.rejects(
    () => mod.resumeSession("sess-1"),
    (err) => err.code === "INVALID_STATE"
  );
});

test("listByEvent() scopes results to user_id + event_id, most recent first", async (t) => {
  const rows = [{ id: "sess-2" }, { id: "sess-1" }];
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null },
  });

  const result = await mod.listByEvent("event-1");

  assert.deepStrictEqual(result, rows);
  const eqCalls = supabase._calls.filter(c => c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["user_id", "user-123"], ["event_id", "event-1"]]);
  const orderCall = supabase._calls.find(c => c.method === "order");
  assert.deepStrictEqual(orderCall.args, ["started_at", { ascending: false }]);
});

test("listByDateRange() scopes results to user_id and the started_at range", async (t) => {
  const rows = [{ id: "sess-1" }, { id: "sess-2" }];
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null },
  });

  const result = await mod.listByDateRange("2026-01-01", "2026-01-31");

  assert.deepStrictEqual(result, rows);
  const gteCall = supabase._calls.find(c => c.method === "gte");
  const lteCall = supabase._calls.find(c => c.method === "lte");
  assert.deepStrictEqual(gteCall.args, ["started_at", "2026-01-01"]);
  assert.deepStrictEqual(lteCall.args, ["started_at", "2026-01-31"]);
  const orderCall = supabase._calls.find(c => c.method === "order");
  assert.deepStrictEqual(orderCall.args, ["started_at", { ascending: true }]);
});

test("getEventExecutionSummary() summarizes the sessions of a single event", async (t) => {
  const rows = [
    { id: "sess-1", status: "finished", started_at: "2026-08-10T08:00:00.000Z", duration_minutes: 30 },
    { id: "sess-2", status: "finished", started_at: "2026-08-15T08:00:00.000Z", duration_minutes: 90 },
  ];
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null },
  });

  const summary = await mod.getEventExecutionSummary("event-1");

  assert.deepStrictEqual(summary, {
    totalDuration: 120,
    sessionsCount: 2,
    lastSession: rows[1],
    hasFinishedSession: true,
    hasRunningSession: false,
  });
});

test("getEventExecutionSummary() flags a currently-running session", async (t) => {
  const rows = [{ id: "sess-1", status: "running", started_at: "2026-08-10T08:00:00.000Z", duration_minutes: null }];
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null },
  });

  const summary = await mod.getEventExecutionSummary("event-1");

  assert.strictEqual(summary.hasRunningSession, true);
  assert.strictEqual(summary.hasFinishedSession, false);
});

test("getEventExecutionSummaries() issues a single batched query for every eventId (no N+1)", async (t) => {
  const rows = [
    { id: "sess-1", event_id: "event-1", status: "finished", started_at: "2026-08-10T08:00:00.000Z", duration_minutes: 30 },
    { id: "sess-2", event_id: "event-2", status: "running", started_at: "2026-08-11T08:00:00.000Z", duration_minutes: null },
  ];
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null },
  });

  const summaries = await mod.getEventExecutionSummaries(["event-1", "event-2", "event-3"]);

  const fromCalls = supabase._calls.filter(c => c.table === "activity_sessions" && c.method === "in");
  assert.strictEqual(fromCalls.length, 1, "should only issue one .in() query, not one per event");
  assert.deepStrictEqual(fromCalls[0].args, ["event_id", ["event-1", "event-2", "event-3"]]);

  assert.strictEqual(summaries["event-1"].hasFinishedSession, true);
  assert.strictEqual(summaries["event-1"].totalDuration, 30);
  assert.strictEqual(summaries["event-2"].hasRunningSession, true);
  // event-3 has no sessions at all — still present with empty values, never omitted.
  assert.deepStrictEqual(summaries["event-3"], {
    totalDuration: 0,
    sessionsCount: 0,
    lastSession: null,
    hasFinishedSession: false,
    hasRunningSession: false,
  });
});

test("getEventExecutionSummaries() returns an empty object without querying when given no ids", async (t) => {
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: [], error: null },
  });

  const summaries = await mod.getEventExecutionSummaries([]);

  assert.deepStrictEqual(summaries, {});
  assert.strictEqual(supabase._calls.length, 0);
});

// ── F10 #5.4 — checagem leve para o tour de onboarding ──────────────────────

test("hasAnySession() returns true when at least one session row exists, of any status", async (t) => {
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: [{ id: "sess-1" }], error: null },
  });

  const result = await mod.hasAnySession();

  assert.strictEqual(result, true);
  const eqCall = supabase._calls.find(c => c.method === "eq");
  assert.deepStrictEqual(eqCall.args, ["user_id", "user-123"]);
  assert.ok(supabase._calls.some(c => c.method === "limit" && c.args[0] === 1));
  assert.ok(!supabase._calls.some(c => c.method === "in" || (c.method === "eq" && c.args[0] === "status")));
});

test("hasAnySession() returns false when the user has never had a session", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: [], error: null },
  });

  const result = await mod.hasAnySession();

  assert.strictEqual(result, false);
});

test("hasAnySession() propagates a Supabase error", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: { message: "network down" } },
  });

  await assert.rejects(
    () => mod.hasAnySession(),
    (err) => err.message === "network down"
  );
});

// ── F1.8 — Histórico global de sessões ──────────────────────────────────────

test("listSessions() defaults to finished+cancelled sessions only, most recent first", async (t) => {
  const rows = [{ id: "sess-2", status: "finished" }, { id: "sess-1", status: "cancelled" }];
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null, count: 2 },
  });

  const result = await mod.listSessions();

  assert.deepStrictEqual(result, { sessions: rows, total: 2, hasMore: false });
  const inCall = supabase._calls.find(c => c.method === "in");
  assert.deepStrictEqual(inCall.args, ["status", ["finished", "cancelled"]]);
  assert.ok(!supabase._calls.some(c => c.method === "eq" && c.args[0] === "status"));
  const orderCall = supabase._calls.find(c => c.method === "order");
  assert.deepStrictEqual(orderCall.args, ["started_at", { ascending: false }]);
  const rangeCall = supabase._calls.find(c => c.method === "range");
  assert.deepStrictEqual(rangeCall.args, [0, 19]);
});

test("listSessions() never includes running or paused sessions even without an explicit filter", async (t) => {
  // Regressão: o histórico nunca deve carregar sessões em andamento — a
  // consulta filtra por status no banco, não no cliente.
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: [], error: null, count: 0 },
  });

  await mod.listSessions();

  const inCall = supabase._calls.find(c => c.method === "in");
  assert.deepStrictEqual(inCall.args[1], ["finished", "cancelled"]);
});

test("listSessions() filters by a single status when requested", async (t) => {
  const rows = [{ id: "sess-1", status: "cancelled" }];
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null, count: 1 },
  });

  const result = await mod.listSessions({ status: "cancelled" });

  assert.deepStrictEqual(result.sessions, rows);
  const eqCall = supabase._calls.find(c => c.method === "eq" && c.args[0] === "status");
  assert.deepStrictEqual(eqCall.args, ["status", "cancelled"]);
  assert.ok(!supabase._calls.some(c => c.method === "in"));
});

test("listSessions() paginates using limit/offset via .range()", async (t) => {
  const rows = [{ id: "sess-1", status: "finished" }];
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null, count: 45 },
  });

  const result = await mod.listSessions({ limit: 20, offset: 20 });

  assert.strictEqual(result.total, 45);
  assert.strictEqual(result.hasMore, true); // 20 + 1 < 45
  const rangeCall = supabase._calls.find(c => c.method === "range");
  assert.deepStrictEqual(rangeCall.args, [20, 39]);
});

test("listSessions() reports hasMore = false once the last page is reached", async (t) => {
  const rows = [{ id: "sess-1", status: "finished" }];
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null, count: 21 },
  });

  const result = await mod.listSessions({ limit: 20, offset: 20 });

  assert.strictEqual(result.hasMore, false); // 20 + 1 === 21
});

test("listSessions() propagates a Supabase error", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: { message: "query failed" }, count: null },
  });

  await assert.rejects(
    () => mod.listSessions(),
    (err) => err.message === "query failed"
  );
});
