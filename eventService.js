import { supabase, currentUserId } from "./supabase.js";

// F15.10 — cache de leitura por carregamento: getEvents() (tabela integral) é
// disparado por 6+ módulos a cada abertura do app; a promessa da consulta é
// memoizada por usuário e invalidada em toda escrita deste service, no rename
// de categoria (categoryService propaga o novo nome em events.category) e no
// logout (script.js). Sem TTL: todas as escritas do app passam por aqui, e
// mudanças vindas de outra aba já são cobertas pelos fluxos de refresh
// existentes. getEventById/getEventsByRange seguem sem cache — são consultas
// recortadas, não a leitura integral repetida que motivou o cache.
let _eventsCache = null; // { userId, promise }

export function invalidateEventsCache() {
  _eventsCache = null;
}

export async function createEvent(fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("events")
    .insert({ ...fields, user_id })
    .select()
    .single();
  if (error) throw error;
  invalidateEventsCache();
  return data;
}

export async function getEvents() {
  const user_id = await currentUserId();
  if (_eventsCache?.userId !== user_id) {
    const entry = { userId: user_id, promise: _fetchEvents(user_id) };
    _eventsCache = entry;
    // Falha não pode ficar memoizada: a próxima chamada deve reconsultar.
    entry.promise.catch(() => {
      if (_eventsCache === entry) _eventsCache = null;
    });
  }
  // Cópia rasa por chamada: consumidores ordenam/filtram o array in place
  // (ex.: a lista de compromissos) e não podem corromper o cache compartilhado.
  return (await _eventsCache.promise).slice();
}

async function _fetchEvents(user_id) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("user_id", user_id)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function getEventById(id) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .eq("user_id", user_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateEvent(id, fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("events")
    .update(fields)
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .single();
  if (error) throw error;
  invalidateEventsCache();
  return data;
}

export async function deleteEvent(id) {
  const user_id = await currentUserId();
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("user_id", user_id);
  if (error) throw error;
  invalidateEventsCache();
}

export async function getEventsByRange(start, end) {
  const user_id = await currentUserId();

  // Two parallel queries:
  // 1. All events (recurring or not) whose base date is within the range
  // 2. Recurring events whose base date is BEFORE range start but may have
  //    occurrences inside the range (not yet ended before range start)
  const [inRange, recurringBases] = await Promise.all([
    supabase.from("events").select("*").eq("user_id", user_id)
      .gte("event_date", start).lte("event_date", end)
      .order("start_time", { ascending: true, nullsFirst: false }),

    supabase.from("events").select("*").eq("user_id", user_id)
      .neq("recurrence_type", "none")
      .lt("event_date", start)           // base started before range
      .lte("event_date", end)            // (redundant but explicit)
      .or(`recurrence_until.is.null,recurrence_until.gte.${start}`)
      .order("start_time", { ascending: true, nullsFirst: false }),
  ]);

  if (inRange.error)        throw inRange.error;
  if (recurringBases.error) throw recurringBases.error;

  // Merge, deduplicating by id
  const seen = new Set();
  const merged = [];
  for (const ev of [...(inRange.data ?? []), ...(recurringBases.data ?? [])]) {
    if (!seen.has(ev.id)) { seen.add(ev.id); merged.push(ev); }
  }
  return merged;
}
