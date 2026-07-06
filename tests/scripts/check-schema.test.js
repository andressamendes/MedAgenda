/**
 * Tests for scripts/check-schema.js — P1 (Guard Rails de Desenvolvimento e
 * Deploy). Cobre os cinco cenários exigidos pela auditoria: schema válido,
 * tabela ausente, coluna ausente, versão incompatível e a mensagem de erro
 * (nunca um "schema inválido" genérico — sempre item a item).
 *
 * `fetchImpl` é injetado em runCheck(), então nenhum destes testes faz rede
 * de verdade nem depende de um projeto Supabase real.
 */
import { test } from "node:test";
import assert from "node:assert";
import {
  readExpectedVersion,
  parseConfigCredentials,
  resolveCredentials,
  evaluateSchemaVersion,
  evaluateTablesAndColumns,
  formatReport,
  runCheck,
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
} from "../../scripts/check-schema.js";

const SCHEMA_SERVICE_SOURCE = 'export const EXPECTED_SCHEMA_VERSION = 14;\n';

function openApiFor(tables) {
  const definitions = {};
  for (const [table, columns] of Object.entries(tables)) {
    definitions[table] = { properties: Object.fromEntries(columns.map(c => [c, {}])) };
  }
  return { definitions };
}

function fullOpenApi() {
  const tables = {};
  for (const table of REQUIRED_TABLES) {
    tables[table] = ["id", ...(REQUIRED_COLUMNS[table] ?? [])];
  }
  return openApiFor(tables);
}

function fakeFetch({ version, openapi, versionStatus = 200, openapiStatus = 200 }) {
  return async (url) => {
    if (url.includes('/schema_version')) {
      return {
        ok: versionStatus === 200,
        status: versionStatus,
        json: async () => (version === undefined ? [] : [{ version }]),
      };
    }
    return {
      ok: openapiStatus === 200,
      status: openapiStatus,
      json: async () => openapi,
    };
  };
}

// ── readExpectedVersion ──────────────────────────────────────────────────

test("readExpectedVersion() extracts the constant from schemaService.js source", () => {
  assert.strictEqual(readExpectedVersion(SCHEMA_SERVICE_SOURCE), 14);
});

test("readExpectedVersion() throws a clear error when the constant is missing", () => {
  assert.throws(() => readExpectedVersion("export const SOMETHING_ELSE = 1;"), /EXPECTED_SCHEMA_VERSION/);
});

// ── parseConfigCredentials / resolveCredentials ─────────────────────────

test("parseConfigCredentials() reads a real config.js", () => {
  const src = 'export const SUPABASE_URL = "https://proj.supabase.co";\nexport const SUPABASE_ANON_KEY = "key123";\n';
  assert.deepStrictEqual(parseConfigCredentials(src), { url: "https://proj.supabase.co", anonKey: "key123" });
});

test("parseConfigCredentials() rejects the placeholder config.example.js content", () => {
  const src = 'export const SUPABASE_URL = "https://your-project-id.supabase.co";\nexport const SUPABASE_ANON_KEY = "your-anon-key-here";\n';
  assert.strictEqual(parseConfigCredentials(src), null);
});

test("resolveCredentials() prefers environment variables over config.js", () => {
  const result = resolveCredentials(
    { SUPABASE_URL: "https://env.supabase.co", SUPABASE_ANON_KEY: "env-key" },
    'export const SUPABASE_URL = "https://config.supabase.co";\nexport const SUPABASE_ANON_KEY = "config-key";\n'
  );
  assert.strictEqual(result.url, "https://env.supabase.co");
  assert.strictEqual(result.source, "variáveis de ambiente");
});

test("resolveCredentials() falls back to config.js when no environment variables are set", () => {
  const result = resolveCredentials(
    {},
    'export const SUPABASE_URL = "https://config.supabase.co";\nexport const SUPABASE_ANON_KEY = "config-key";\n'
  );
  assert.strictEqual(result.url, "https://config.supabase.co");
  assert.strictEqual(result.source, "config.js");
});

test("resolveCredentials() returns null when neither source has usable credentials — never invents one", () => {
  assert.strictEqual(resolveCredentials({}, null), null);
  assert.strictEqual(resolveCredentials({}, 'export const SUPABASE_URL = "https://your-project-id.supabase.co";'), null);
});

// ── evaluateSchemaVersion ────────────────────────────────────────────────

test("evaluateSchemaVersion() — versão compatível", () => {
  const result = evaluateSchemaVersion({ ok: true, version: 14 }, 14);
  assert.strictEqual(result.ok, true);
  assert.match(result.label, /schema version: 14/);
});

test("evaluateSchemaVersion() — versão incompatível (banco desatualizado) produz mensagem explícita com os dois números", () => {
  const result = evaluateSchemaVersion({ ok: true, version: 10 }, 14);
  assert.strictEqual(result.ok, false);
  assert.match(result.label, /10/);
  assert.match(result.label, /14/);
});

test("evaluateSchemaVersion() — versão ausente (linha/tabela inexistente)", () => {
  const result = evaluateSchemaVersion({ ok: true, version: null }, 14);
  assert.strictEqual(result.ok, false);
  assert.match(result.label, /ausente/);
});

test("evaluateSchemaVersion() — erro de consulta nunca é confundido com sucesso", () => {
  const result = evaluateSchemaVersion({ ok: false, error: "HTTP 404" }, 14);
  assert.strictEqual(result.ok, false);
  assert.match(result.label, /não foi possível consultar/);
});

// ── evaluateTablesAndColumns ─────────────────────────────────────────────

test("evaluateTablesAndColumns() — todas as tabelas e colunas presentes: tudo ok, um item por tabela/coluna", () => {
  const openapi = fullOpenApi();
  const results = evaluateTablesAndColumns(openapi.definitions);
  assert.ok(results.every(r => r.ok));
  assert.ok(results.some(r => r.label === "profiles"));
  assert.ok(results.some(r => r.label === "profiles.daily_goal_minutes"));
});

test("evaluateTablesAndColumns() — tabela ausente é reportada nominalmente, nunca como falha genérica", () => {
  const openapi = fullOpenApi();
  delete openapi.definitions.activity_sessions;

  const results = evaluateTablesAndColumns(openapi.definitions);
  const failure = results.find(r => !r.ok);
  assert.ok(failure);
  assert.strictEqual(failure.label, "tabela ausente: activity_sessions");
});

test("evaluateTablesAndColumns() — coluna crítica ausente é reportada mesmo com a tabela existindo (reproduz o caso de 12_time_goals.sql)", () => {
  const openapi = openApiFor({
    ...Object.fromEntries(REQUIRED_TABLES.map(t => [t, ["id"]])),
    profiles: ["id"], // profiles existe, mas sem as colunas de meta de tempo
  });

  const results = evaluateTablesAndColumns(openapi.definitions);
  const tableResult = results.find(r => r.label === "profiles");
  const columnFailure = results.find(r => r.label === "coluna ausente: profiles.daily_goal_minutes");

  assert.strictEqual(tableResult.ok, true, "a tabela em si existe");
  assert.ok(columnFailure, "a ausência da coluna crítica deve ser reportada separadamente");
});

// ── formatReport ──────────────────────────────────────────────────────────

test("formatReport() nunca colapsa os resultados em uma única linha genérica — um item por linha, com ✓/✕", () => {
  const report = formatReport([
    { ok: true, label: "events" },
    { ok: false, label: "tabela ausente: reviews" },
  ]);
  assert.match(report, /✓ events/);
  assert.match(report, /✕ tabela ausente: reviews/);
  assert.doesNotMatch(report, /schema inválido/i);
});

// ── runCheck (orquestração ponta a ponta, fetch injetado) ───────────────

test("runCheck() — schema totalmente válido: ok=true, nenhum item de resultado falho", async () => {
  const outcome = await runCheck({
    env: { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "key" },
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: fakeFetch({ version: 14, openapi: fullOpenApi() }),
  });

  assert.strictEqual(outcome.ok, true);
  assert.strictEqual(outcome.blockedByEnvironment, false);
  assert.ok(outcome.results.every(r => r.ok));
});

test("runCheck() — tabela ausente: ok=false, e o item específico identifica a tabela", async () => {
  const openapi = fullOpenApi();
  delete openapi.definitions.reviews;

  const outcome = await runCheck({
    env: { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "key" },
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: fakeFetch({ version: 14, openapi }),
  });

  assert.strictEqual(outcome.ok, false);
  assert.ok(outcome.results.some(r => r.label === "tabela ausente: reviews"));
});

test("runCheck() — coluna crítica ausente: ok=false, e o item aponta tabela.coluna", async () => {
  const openapi = openApiFor(Object.fromEntries(REQUIRED_TABLES.map(t => [t, t === "profiles" ? ["id"] : ["id"]])));

  const outcome = await runCheck({
    env: { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "key" },
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: fakeFetch({ version: 14, openapi }),
  });

  assert.strictEqual(outcome.ok, false);
  assert.ok(outcome.results.some(r => r.label === "coluna ausente: profiles.daily_goal_minutes"));
});

test("runCheck() — versão de schema incompatível: ok=false mesmo que todas as tabelas/colunas existam", async () => {
  const outcome = await runCheck({
    env: { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "key" },
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: fakeFetch({ version: 10, openapi: fullOpenApi() }),
  });

  assert.strictEqual(outcome.ok, false);
  assert.ok(outcome.results.some(r => !r.ok && /schema version/.test(r.label)));
});

test("runCheck() — sem credenciais (nem env, nem config.js): falha explicitamente informando a limitação, nunca mascara como sucesso", async () => {
  const outcome = await runCheck({
    env: {},
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: async () => { throw new Error("fetch não deveria ser chamado sem credenciais"); },
  });

  assert.strictEqual(outcome.ok, false);
  assert.strictEqual(outcome.blockedByEnvironment, true);
  assert.match(outcome.message, /depende do ambiente/);
});

test("runCheck() — falha de rede/consulta ao schema_version nunca é relatada como schema compatível", async () => {
  const outcome = await runCheck({
    env: { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "key" },
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: async (url) => {
      if (url.includes('/schema_version')) throw new Error("network down");
      return { ok: true, json: async () => fullOpenApi() };
    },
  });

  assert.strictEqual(outcome.ok, false);
  assert.ok(outcome.results.some(r => !r.ok && /network down/.test(r.label)));
});
