import { supabase, currentUserId } from './supabase.js';

export async function getProfile() {
  const id = await currentUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function upsertProfile(fields) {
  const id = await currentUserId();

  const allowed = [
    'full_name', 'avatar_url', 'university', 'course',
    'semester', 'timezone', 'notification_enabled', 'theme',
  ];
  const payload = { id };
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      payload[key] = fields[key];
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}
