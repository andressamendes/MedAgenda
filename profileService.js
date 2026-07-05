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

  // 'theme' existe em sql/05_profiles.sql (CHECK light/dark/system) e é aceito
  // aqui para não quebrar upserts futuros, mas não há seletor de tema na UI
  // ainda — nenhuma tela grava ou lê este campo hoje.
  const allowed = [
    'full_name', 'avatar_url', 'university', 'course',
    'semester', 'timezone', 'notification_enabled', 'theme',
    // Metas de Tempo (F2.2) — ver sql/12_time_goals.sql.
    'daily_goal_minutes', 'weekly_goal_minutes', 'monthly_goal_minutes',
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
