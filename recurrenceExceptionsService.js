// ── recurrenceExceptionsService.js — repositório de recurrence_exceptions ──
//
// Uma exceção representa uma ocorrência isolada de uma série recorrente que
// foi cancelada ("apenas esta" na exclusão) ou teve campos sobrescritos
// ("apenas esta" na edição) — ver sql/24_recurrence_shared.sql e
// supabase/functions/_shared/recurrence-core.js (que aplica essas exceções
// durante a expansão). "Esta e as próximas" NUNCA usa esta tabela — é
// resolvido em recurrenceService.js dividindo a série em duas linhas base.

import { supabase, currentUserId } from "./supabase.js";

/**
 * Busca todas as exceções de um conjunto de eventos-base, já agrupadas no
 * formato que recurrence-core.js espera (`exceptionsByEventId`): Map(base
 * event id -> Map(data ISO -> {is_cancelled, override})). Uma única consulta
 * por página exibida — nunca uma consulta por evento (evita N+1).
 */
export async function getExceptionsMap(sourceTable, baseEventIds) {
  const ids = [...new Set(baseEventIds)].filter(Boolean);
  if (ids.length === 0) return new Map();

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("recurrence_exceptions")
    .select("*")
    .eq("user_id", user_id)
    .eq("source_table", sourceTable)
    .in("base_event_id", ids);
  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.base_event_id)) map.set(row.base_event_id, new Map());
    map.get(row.base_event_id).set(row.occurrence_date, {
      is_cancelled: row.is_cancelled,
      override:     row.override,
    });
  }
  return map;
}

/** Cancela ("exclui apenas esta") uma ocorrência pontual da série. */
export async function cancelOccurrence(sourceTable, baseEventId, occurrenceDate) {
  return _upsertException(sourceTable, baseEventId, occurrenceDate, { is_cancelled: true, override: null });
}

/** Sobrescreve ("edita apenas esta") os campos de uma ocorrência pontual. */
export async function overrideOccurrence(sourceTable, baseEventId, occurrenceDate, override) {
  return _upsertException(sourceTable, baseEventId, occurrenceDate, { is_cancelled: false, override });
}

async function _upsertException(sourceTable, baseEventId, occurrenceDate, fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("recurrence_exceptions")
    .upsert(
      { user_id, source_table: sourceTable, base_event_id: baseEventId, occurrence_date: occurrenceDate, ...fields },
      { onConflict: "source_table,base_event_id,occurrence_date" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Remove todas as exceções de uma série (chamada ao excluir a série inteira). */
export async function deleteExceptionsForBase(sourceTable, baseEventId) {
  const user_id = await currentUserId();
  const { error } = await supabase
    .from("recurrence_exceptions")
    .delete()
    .eq("user_id", user_id)
    .eq("source_table", sourceTable)
    .eq("base_event_id", baseEventId);
  if (error) throw error;
}
