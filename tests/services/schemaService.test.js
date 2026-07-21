/**
 * Tests for schemaService.js — P0 (Proteção contra Divergência de Schema).
 *
 * Cobre os quatro cenários exigidos pela auditoria: schema compatível,
 * schema incompatível (versão antiga), versão ausente (tabela/linha
 * inexistente) e erro de consulta (rede/RLS/tabela ausente por completo —
 * exatamente o caso do incidente das migrations 11–13, em que a tabela nem
 * existia no banco).
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

function loadSchemaService(t, tableResponses) {
  const supabase = createSupabaseMock({ tableResponses });
  t.mock.module(SUPABASE_SPECIFIER, { namedExports: { supabase } });
  return import(`../../schemaService.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

test("diagnoseSchema() — banco na versão esperada é compatível", async (t) => {
  const { mod } = await loadSchemaService(t, {
    schema_version: { data: { version: 25 }, error: null },
  });

  const diagnosis = await mod.diagnoseSchema();
  assert.strictEqual(diagnosis.compatible, true);
  assert.strictEqual(diagnosis.dbVersion, mod.EXPECTED_SCHEMA_VERSION);
  assert.strictEqual(diagnosis.code, null);
});

test("diagnoseSchema() — banco numa versão futura (maior que a esperada) também é compatível", async (t) => {
  const { mod } = await loadSchemaService(t, {
    schema_version: { data: { version: 999 }, error: null },
  });

  const diagnosis = await mod.diagnoseSchema();
  assert.strictEqual(diagnosis.compatible, true);
});

test("diagnoseSchema() — banco em versão antiga (migrations pendentes) é incompatível com code schema_outdated", async (t) => {
  const { mod } = await loadSchemaService(t, {
    schema_version: { data: { version: 10 }, error: null },
  });

  const diagnosis = await mod.diagnoseSchema();
  assert.strictEqual(diagnosis.compatible, false);
  assert.strictEqual(diagnosis.code, "schema_outdated");
  assert.strictEqual(diagnosis.dbVersion, 10);
  assert.strictEqual(diagnosis.expectedVersion, mod.EXPECTED_SCHEMA_VERSION);
});

test("diagnoseSchema() — linha ausente (schema_version vazio) é incompatível com code schema_version_missing", async (t) => {
  const { mod } = await loadSchemaService(t, {
    schema_version: { data: null, error: null },
  });

  const diagnosis = await mod.diagnoseSchema();
  assert.strictEqual(diagnosis.compatible, false);
  assert.strictEqual(diagnosis.code, "schema_version_missing");
  assert.strictEqual(diagnosis.dbVersion, null);
});

test("diagnoseSchema() — erro de consulta (ex.: tabela schema_version nem existe, 42P01) é incompatível com code schema_query_failed, nunca lança", async (t) => {
  const queryError = Object.assign(new Error('relation "public.schema_version" does not exist'), { code: "42P01" });
  const { mod } = await loadSchemaService(t, {
    schema_version: { data: null, error: queryError },
  });

  const diagnosis = await mod.diagnoseSchema();
  assert.strictEqual(diagnosis.compatible, false);
  assert.strictEqual(diagnosis.code, "schema_query_failed");
  assert.strictEqual(diagnosis.cause, queryError);
});

test("getSchemaVersion() — lança o erro do Supabase tal como recebido, sem reclassificar", async (t) => {
  const queryError = Object.assign(new Error("network down"), { code: "ECONNRESET" });
  const { mod } = await loadSchemaService(t, {
    schema_version: { data: null, error: queryError },
  });

  await assert.rejects(() => mod.getSchemaVersion(), (err) => err === queryError);
});

test("getSchemaVersion() — retorna null quando não há linha (data null, sem erro)", async (t) => {
  const { mod } = await loadSchemaService(t, {
    schema_version: { data: null, error: null },
  });

  assert.strictEqual(await mod.getSchemaVersion(), null);
});

test("assertSchemaCompatible() — resolve silenciosamente quando compatível", async (t) => {
  const { mod } = await loadSchemaService(t, {
    schema_version: { data: { version: 25 }, error: null },
  });

  await assert.doesNotReject(() => mod.assertSchemaCompatible());
});

test("assertSchemaCompatible() — lança SchemaMismatchError (com __schemaMismatch e code) quando o banco está desatualizado", async (t) => {
  const { mod } = await loadSchemaService(t, {
    schema_version: { data: { version: 5 }, error: null },
  });

  await assert.rejects(
    () => mod.assertSchemaCompatible(),
    (err) => {
      assert.strictEqual(err.name, "SchemaMismatchError");
      assert.strictEqual(err.__schemaMismatch, true);
      assert.strictEqual(err.code, "schema_outdated");
      assert.strictEqual(err.dbVersion, 5);
      assert.strictEqual(err.expectedVersion, mod.EXPECTED_SCHEMA_VERSION);
      return true;
    }
  );
});

test("assertSchemaCompatible() — lança SchemaMismatchError quando a linha está ausente", async (t) => {
  const { mod } = await loadSchemaService(t, {
    schema_version: { data: null, error: null },
  });

  await assert.rejects(
    () => mod.assertSchemaCompatible(),
    (err) => err.__schemaMismatch === true && err.code === "schema_version_missing"
  );
});

test("assertSchemaCompatible() — lança SchemaMismatchError quando a consulta falha (rede/tabela ausente)", async (t) => {
  const queryError = Object.assign(new Error('relation "public.schema_version" does not exist'), { code: "42P01" });
  const { mod } = await loadSchemaService(t, {
    schema_version: { data: null, error: queryError },
  });

  await assert.rejects(
    () => mod.assertSchemaCompatible(),
    (err) => err.__schemaMismatch === true && err.code === "schema_query_failed"
  );
});
