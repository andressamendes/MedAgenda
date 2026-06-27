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
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("user_id", user_id)
    .gte("event_date", start)
    .lte("event_date", end)
    .order("start_time", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}
