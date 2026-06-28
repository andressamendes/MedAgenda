import { supabase } from "./supabase.js";

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error("Usuário não autenticado.");
  return id;
}

export async function createEvent(fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("events")
    .insert({ ...fields, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getEvents() {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("user_id", user_id)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false });
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
