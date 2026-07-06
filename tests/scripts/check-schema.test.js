/**
 * Tests for scripts/check-schema.js — P1 (Guard Rails de Desenvolvimento e
 * Deploy). Cobre os cinco cenários exigidos pela auditoria: schema válido,
 * tabela ausente, coluna ausente, versão incompatível e a mensagem de erro
 * (nunca um "schema inválido" genérico — sempre item a item).
 *
 * A checagem de tabelas/colunas consulta um recurso por vez
 * (`select=<coluna>&limit=1`), o mesmo formato já usado para schema_version —
 * nunca a introspecção OpenAPI da raiz da API (`GET /rest/v1/`), que em
 * produção retorna HTTP 401 pelo gateway do Supabase (rota não exposta na
 * raiz). `fetchImpl` é injetado em runCheck()/evaluateSchemaStructure(),
 * então nenhum destes testes faz rede de verdade nem depende de um projeto
 * Supabase real.
 */
import { test } from "node:test";
import assert from "node:assert";
import {
  readExpectedVersion,
  parseConfigCredentials,
  resolveCredentials,
  evaluateSchemaVersion,
  interpretTableCheck,
  interpretColumnCheck,
  evaluateSchemaStructure,
  formatReport,
  runCheck,
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
} from "../../scripts/check-schema.js";

const SCHEMA_SERVICE_SOURCE = 'export const EXPECTED_SCHEMA_VERSION = 14;\n';
const URL = "https://proj.supabase.co";
const ANON_KEY = "anon-key";

/**
 * Simula o Supabase real: `tables` mapeia nome da tabela para o conjunto de
 * colunas que ela de fato tem (ou `undefined` para uma tabela ausente).
 * Reproduz os mesmos formatos de erro do PostgREST observados na prática:
 * PGRST205 (relation not found) e 42703 (undefined_column).
 */
function fakeFetch({ version, tables }) {
  return async (url) => {
    if (url.includes('/schema_version')) {
      return { ok: true, status: 200, json: async () => (version === undefined ? [] : [{ version }]) };
    }

    const match = url.match(/\/rest\/v1\/([^?]+)\?select=([^&]+)/);
    const [, table, column] = match;
    const columns = tables[table];

    if (!columns) {
      return {
        ok: false, status: 404,
        json: async () => ({ code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` }),
      };
    }
    if (!columns.has(column)) {
      return {
        ok: false, status: 400,
        json: async () => ({ code: "42703", message: `column ${table}.${column} does not exist` }),
      };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
}

function fullTables() {
  const tables = {};
  for (const table of REQUIRED_TABLES) {
    tables[table] = new Set(["id", ...(REQUIRED_COLUMNS[table] ?? [])]);
  }
  return tables;
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

// ── interpretTableCheck / interpretColumnCheck ──────────────────────────

test("interpretTableCheck() — tabela existente (200) é ok", () => {
  const result = interpretTableCheck("events", { ok: true, status: 200, body: [] });
  assert.deepStrictEqual(result, { ok: true, label: "events" });
});

test("interpretTableCheck() — PGRST205 (relation not found) é reportado nominalmente, nunca genérico", () => {
  const result = interpretTableCheck("reviews", {
    ok: false, status: 404, body: { code: "PGRST205", message: "Could not find the table 'public.reviews'" },
  });
  assert.deepStrictEqual(result, { ok: false, label: "tabela ausente: reviews" });
});

test("interpretTableCheck() — outro erro HTTP (ex.: 401 do gateway) não é confundido com tabela ausente", () => {
  const result = interpretTableCheck("events", { ok: false, status: 401, body: { message: "Invalid API key" } });
  assert.strictEqual(result.ok, false);
  assert.doesNotMatch(result.label, /tabela ausente/);
  assert.match(result.label, /HTTP 401/);
});

test("interpretColumnCheck() — coluna existente é ok", () => {
  const result = interpretColumnCheck("profiles", "daily_goal_minutes", { ok: true, status: 200, body: [] });
  assert.deepStrictEqual(result, { ok: true, label: "profiles.daily_goal_minutes" });
});

test("interpretColumnCheck() — 42703 (undefined_column) é reportado nominalmente (reproduz o caso de 12_time_goals.sql)", () => {
  const result = interpretColumnCheck("profiles", "daily_goal_minutes", {
    ok: false, status: 400, body: { code: "42703", message: "column profiles.daily_goal_minutes does not exist" },
  });
  assert.deepStrictEqual(result, { ok: false, label: "coluna ausente: profiles.daily_goal_minutes" });
});

// ── evaluateSchemaStructure ──────────────────────────────────────────────

test("evaluateSchemaStructure() — todas as tabelas e colunas presentes: tudo ok", async () => {
  const results = await evaluateSchemaStructure({
    fetchImpl: fakeFetch({ tables: fullTables() }), url: URL, anonKey: ANON_KEY,
  });
  assert.ok(results.every(r => r.ok));
  assert.ok(results.some(r => r.label === "profiles"));
  assert.ok(results.some(r => r.label === "profiles.daily_goal_minutes"));
});

test("evaluateSchemaStructure() — tabela ausente é reportada nominalmente, e suas colunas críticas não são checadas (ruído redundante)", async () => {
  const tables = fullTables();
  delete tables.profiles;

  const results = await evaluateSchemaStructure({
    fetchImpl: fakeFetch({ tables }), url: URL, anonKey: ANON_KEY,
  });

  assert.ok(results.some(r => r.label === "tabela ausente: profiles"));
  assert.ok(!results.some(r => r.label.includes("profiles.daily_goal_minutes")));
});

test("evaluateSchemaStructure() — coluna crítica ausente é reportada mesmo com a tabela existindo", async () => {
  const tables = fullTables();
  tables.profiles = new Set(["id"]); // profiles existe, sem as colunas de meta de tempo

  const results = await evaluateSchemaStructure({
    fetchImpl: fakeFetch({ tables }), url: URL, anonKey: ANON_KEY,
  });

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
    env: { SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON_KEY },
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: fakeFetch({ version: 14, tables: fullTables() }),
  });

  assert.strictEqual(outcome.ok, true);
  assert.strictEqual(outcome.blockedByEnvironment, false);
  assert.ok(outcome.results.every(r => r.ok));
});

test("runCheck() — tabela ausente: ok=false, e o item específico identifica a tabela", async () => {
  const tables = fullTables();
  delete tables.reviews;

  const outcome = await runCheck({
    env: { SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON_KEY },
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: fakeFetch({ version: 14, tables }),
  });

  assert.strictEqual(outcome.ok, false);
  assert.ok(outcome.results.some(r => r.label === "tabela ausente: reviews"));
});

test("runCheck() — coluna crítica ausente: ok=false, e o item aponta tabela.coluna", async () => {
  const tables = fullTables();
  tables.profiles = new Set(["id"]);

  const outcome = await runCheck({
    env: { SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON_KEY },
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: fakeFetch({ version: 14, tables }),
  });

  assert.strictEqual(outcome.ok, false);
  assert.ok(outcome.results.some(r => r.label === "coluna ausente: profiles.daily_goal_minutes"));
});

test("runCheck() — versão de schema incompatível: ok=false mesmo que todas as tabelas/colunas existam", async () => {
  const outcome = await runCheck({
    env: { SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON_KEY },
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: fakeFetch({ version: 10, tables: fullTables() }),
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
    env: { SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON_KEY },
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: async (url) => {
      if (url.includes('/schema_version')) throw new Error("network down");
      return fakeFetch({ tables: fullTables() })(url);
    },
  });

  assert.strictEqual(outcome.ok, false);
  assert.ok(outcome.results.some(r => !r.ok && /network down/.test(r.label)));
});

test("runCheck() — um erro inesperado (ex.: HTTP 401 do gateway, não PGRST205) numa tabela nunca é confundido com 'tabela ausente'", async () => {
  const outcome = await runCheck({
    env: { SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON_KEY },
    configSource: null,
    schemaServiceSource: SCHEMA_SERVICE_SOURCE,
    fetchImpl: async (url) => {
      if (url.includes('/schema_version')) return { ok: true, status: 200, json: async () => [{ version: 14 }] };
      return { ok: false, status: 401, json: async () => ({ message: "Invalid API key" }) };
    },
  });

  assert.strictEqual(outcome.ok, false);
  const eventsResult = outcome.results.find(r => r.label.startsWith("events"));
  assert.doesNotMatch(eventsResult.label, /tabela ausente/);
  assert.match(eventsResult.label, /HTTP 401/);
});
