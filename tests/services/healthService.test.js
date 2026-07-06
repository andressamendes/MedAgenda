/**
 * Tests for healthService.js — O1 (Observabilidade e Saúde do Sistema).
 *
 * healthService não faz consultas próprias: consolida o que
 * diagnosticService.runDiagnostics(), schemaService.diagnoseSchema() e
 * errorService.getRecentErrors() já expõem. Por isso os testes mockam
 * exatamente essas três fontes, nunca supabase.js diretamente.
 */
import { test } from "node:test";
import assert from "node:assert";

const DIAGNOSTIC_SPECIFIER = new URL("../../diagnosticService.js", import.meta.url).href;
const SCHEMA_SPECIFIER     = new URL("../../schemaService.js", import.meta.url).href;
const ERROR_SPECIFIER      = new URL("../../errorService.js", import.meta.url).href;

function baseDiagnostics(overrides = {}) {
  return {
    version: "1.0.0-test",
    timestamp: "2026-07-06T12:00:00.000Z",
    supabase: { ok: true, latency: 20 },
    auth: { ok: true, status: "Autenticado", email: "user@example.com", expiresAt: "01/01/2030" },
    storage: { ok: true, latency: 10 },
    serviceWorker: { ok: true, status: "Ativo" },
    push: { ok: true, status: "Autorizado" },
    lastSync: "01/01/2026",
    environment: "localhost",
    recentErrors: [],
    ...overrides,
  };
}

function baseSchema(overrides = {}) {
  return { compatible: true, code: null, dbVersion: 14, expectedVersion: 14, cause: null, ...overrides };
}

async function loadHealthService(t, { diagnostics, schema, recentErrors = [] } = {}) {
  t.mock.module(DIAGNOSTIC_SPECIFIER, {
    namedExports: { runDiagnostics: async () => diagnostics ?? baseDiagnostics() },
  });
  t.mock.module(SCHEMA_SPECIFIER, {
    namedExports: { diagnoseSchema: async () => schema ?? baseSchema() },
  });
  t.mock.module(ERROR_SPECIFIER, {
    namedExports: { getRecentErrors: () => recentErrors },
  });
  return import(`../../healthService.js?t=${Math.random()}`);
}

function errorEntry(overrides = {}) {
  return {
    ts: new Date().toISOString(),
    category: "unknown",
    code: null,
    status: null,
    message: "erro",
    friendly: "Algo deu errado.",
    context: {},
    ...overrides,
  };
}

test("checkHealth() — todos os componentes ok resulta em HEALTHY", async (t) => {
  const mod = await loadHealthService(t);
  const health = await mod.checkHealth();

  assert.strictEqual(health.status, mod.HEALTH_STATUS.HEALTHY);
  assert.strictEqual(health.components.database.ok, true);
  assert.strictEqual(health.components.schema.compatible, true);
  assert.strictEqual(health.components.edgeFunctions.status, "available");
  assert.strictEqual(health.components.auth.status, "authenticated");
  assert.strictEqual(health.lastError, null);
  assert.strictEqual(health.recentErrorCount, 0);
});

test("checkHealth() — banco inacessível resulta em OFFLINE (prioridade máxima)", async (t) => {
  const mod = await loadHealthService(t, {
    diagnostics: baseDiagnostics({ supabase: { ok: false, error: "Falha na conexão" } }),
  });
  const health = await mod.checkHealth();

  assert.strictEqual(health.status, mod.HEALTH_STATUS.OFFLINE);
});

test("checkHealth() — schema incompatível resulta em DEGRADED mesmo com banco ok", async (t) => {
  const mod = await loadHealthService(t, {
    schema: baseSchema({ compatible: false, code: "schema_outdated", dbVersion: 10 }),
  });
  const health = await mod.checkHealth();

  assert.strictEqual(health.status, mod.HEALTH_STATUS.DEGRADED);
  assert.strictEqual(health.components.schema.compatible, false);
  assert.strictEqual(health.components.schema.code, "schema_outdated");
});

test("checkHealth() — erro de IA 'UNAVAILABLE' recente marca Edge Functions indisponíveis e resulta em DEGRADED", async (t) => {
  const mod = await loadHealthService(t, {
    recentErrors: [errorEntry({ category: "ai", code: "UNAVAILABLE" })],
  });
  const health = await mod.checkHealth();

  assert.strictEqual(health.components.edgeFunctions.status, "unavailable");
  assert.strictEqual(health.status, mod.HEALTH_STATUS.DEGRADED);
});

test("checkHealth() — erro 'server_unavailable' recente também marca Edge Functions indisponíveis", async (t) => {
  const mod = await loadHealthService(t, {
    recentErrors: [errorEntry({ category: "server_unavailable" })],
  });
  const health = await mod.checkHealth();

  assert.strictEqual(health.components.edgeFunctions.status, "unavailable");
  assert.strictEqual(health.status, mod.HEALTH_STATUS.DEGRADED);
});

test("checkHealth() — sessão expirada (sem auth.ok, com erro de categoria auth recente) resulta em WARNING", async (t) => {
  const mod = await loadHealthService(t, {
    diagnostics: baseDiagnostics({ auth: { ok: false, status: "Sem sessão ativa" } }),
    recentErrors: [errorEntry({ category: "auth" })],
  });
  const health = await mod.checkHealth();

  assert.strictEqual(health.components.auth.status, "expired");
  assert.strictEqual(health.status, mod.HEALTH_STATUS.WARNING);
});

test("checkHealth() — sem sessão e sem erros de auth é apenas 'unauthenticated', não degrada o status geral", async (t) => {
  const mod = await loadHealthService(t, {
    diagnostics: baseDiagnostics({ auth: { ok: false, status: "Sem sessão ativa" } }),
  });
  const health = await mod.checkHealth();

  assert.strictEqual(health.components.auth.status, "unauthenticated");
  assert.strictEqual(health.status, mod.HEALTH_STATUS.HEALTHY);
});

test("checkHealth() — erros recorrentes (>=3 recentes) resultam em WARNING", async (t) => {
  const mod = await loadHealthService(t, {
    recentErrors: [errorEntry(), errorEntry(), errorEntry()],
  });
  const health = await mod.checkHealth();

  assert.strictEqual(health.recentErrorCount, 3);
  assert.strictEqual(health.status, mod.HEALTH_STATUS.WARNING);
});

test("checkHealth() — latência alta do banco resulta em WARNING", async (t) => {
  const mod = await loadHealthService(t, {
    diagnostics: baseDiagnostics({ supabase: { ok: true, latency: 5000 } }),
  });
  const health = await mod.checkHealth();

  assert.strictEqual(health.status, mod.HEALTH_STATUS.WARNING);
});

test("checkHealth() — expõe o último erro registrado (mais recente primeiro, já ordenado por errorService)", async (t) => {
  const recent = errorEntry({ message: "erro mais recente" });
  const mod = await loadHealthService(t, {
    recentErrors: [recent, errorEntry({ message: "erro antigo" })],
  });
  const health = await mod.checkHealth();

  assert.strictEqual(health.lastError.message, "erro mais recente");
});

test("checkHealth() — erros antigos (fora da janela de 5 min) não contam como recorrentes nem derrubam Edge Functions", async (t) => {
  const oldTs = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const mod = await loadHealthService(t, {
    recentErrors: [
      errorEntry({ ts: oldTs, category: "ai", code: "UNAVAILABLE" }),
      errorEntry({ ts: oldTs }),
      errorEntry({ ts: oldTs }),
      errorEntry({ ts: oldTs }),
    ],
  });
  const health = await mod.checkHealth();

  assert.strictEqual(health.components.edgeFunctions.status, "available");
  assert.strictEqual(health.recentErrorCount, 0);
  assert.strictEqual(health.status, mod.HEALTH_STATUS.HEALTHY);
});
