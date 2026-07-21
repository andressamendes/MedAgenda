// ── schemaService.js — Diagnóstico de compatibilidade de schema (P0) ───────
//
// Único responsável por: obter a versão do schema aplicada no banco
// (public.schema_version, ver sql/14_schema_version.sql), compará-la com a
// versão mínima que este build do frontend exige, e produzir um diagnóstico
// estruturado do resultado. Nenhuma lógica de negócio — não decide o que
// fazer com o resultado (isso é de script.js, no bootstrap) nem como exibir
// o erro (isso é de errorService.js/stateView.js).
//
// Existe para impedir a repetição do incidente das migrations 11–13: código
// publicado no GitHub Pages enquanto o banco ainda não tinha essas tabelas.
// A partir de agora, qualquer sessão só inicializa Dashboard/Insights/
// Histórico/IA/Sessões depois de confirmar aqui que o banco já recebeu as
// migrations que este build depende.

import { supabase } from "./supabase.js";

// Bump obrigatório sempre que uma nova migration numerada crie schema do
// qual o frontend passe a depender — no mesmo commit que introduz esse uso.
// Ver convenção documentada no cabeçalho de sql/14_schema_version.sql.
export const EXPECTED_SCHEMA_VERSION = 23;

/**
 * Erro estruturado para qualquer forma de incompatibilidade de schema —
 * banco desatualizado, tabela schema_version ausente/vazia, ou falha ao
 * consultá-la. Reconhecido por errorService.categorize() pela flag
 * `__schemaMismatch`, nunca por texto de mensagem (mesmo contrato usado por
 * AuthError/AIError).
 */
export class SchemaMismatchError extends Error {
  constructor(message, { code, dbVersion = null, expectedVersion = EXPECTED_SCHEMA_VERSION } = {}) {
    super(message);
    this.name = "SchemaMismatchError";
    this.__schemaMismatch = true;
    this.code = code;
    this.dbVersion = dbVersion;
    this.expectedVersion = expectedVersion;
  }
}

/** Lê a versão atual do schema aplicada no banco, ou null se a linha/tabela não existir. */
export async function getSchemaVersion() {
  const { data, error } = await supabase
    .from("schema_version")
    .select("version")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  return data?.version ?? null;
}

/**
 * Compara a versão do banco com EXPECTED_SCHEMA_VERSION e produz um
 * diagnóstico. Nunca lança — o chamador decide o que fazer com
 * `compatible: false` (ver assertSchemaCompatible(), usado pelo bootstrap).
 */
export async function diagnoseSchema() {
  let dbVersion;
  try {
    dbVersion = await getSchemaVersion();
  } catch (err) {
    return {
      compatible: false,
      code: "schema_query_failed",
      dbVersion: null,
      expectedVersion: EXPECTED_SCHEMA_VERSION,
      cause: err,
    };
  }

  if (dbVersion === null) {
    return {
      compatible: false,
      code: "schema_version_missing",
      dbVersion: null,
      expectedVersion: EXPECTED_SCHEMA_VERSION,
      cause: null,
    };
  }

  if (dbVersion < EXPECTED_SCHEMA_VERSION) {
    return {
      compatible: false,
      code: "schema_outdated",
      dbVersion,
      expectedVersion: EXPECTED_SCHEMA_VERSION,
      cause: null,
    };
  }

  return {
    compatible: true,
    code: null,
    dbVersion,
    expectedVersion: EXPECTED_SCHEMA_VERSION,
    cause: null,
  };
}

const DIAGNOSIS_MESSAGES = {
  schema_query_failed:   "Não foi possível verificar a versão do schema do banco de dados.",
  schema_version_missing: "A tabela schema_version não foi encontrada ou está vazia — o banco ainda não recebeu a migration 14_schema_version.sql (ou nenhuma migration).",
  schema_outdated:        "O banco de dados está em uma versão de schema anterior à exigida por este build do frontend.",
};

/**
 * Ponto único chamado pelo bootstrap (script.js): resolve se compatível,
 * lança SchemaMismatchError caso contrário. Mantém diagnoseSchema() puro
 * (nunca lança) e este wrapper como a única ponte para o fluxo baseado em
 * exceções que errorService.handleError()/stateView.js já usam para todo o
 * resto do app.
 */
export async function assertSchemaCompatible() {
  const diagnosis = await diagnoseSchema();
  if (diagnosis.compatible) return diagnosis;

  throw new SchemaMismatchError(DIAGNOSIS_MESSAGES[diagnosis.code], {
    code: diagnosis.code,
    dbVersion: diagnosis.dbVersion,
    expectedVersion: diagnosis.expectedVersion,
  });
}
