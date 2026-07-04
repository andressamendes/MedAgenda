import { supabase, currentUserId } from "./supabase.js";

export async function createActivitySession(fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .insert({ ...fields, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getActivitySessionById(id) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getActivitySessions() {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*")
    .eq("user_id", user_id)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateActivitySession(id, fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .update(fields)
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteActivitySession(id) {
  const user_id = await currentUserId();
  const { error } = await supabase
    .from("activity_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user_id);
  if (error) throw error;
}
