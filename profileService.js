import { supabase, currentUserId } from './supabase.js';

// ── Notificação de perfil atualizado ────────────────────────────────────────
// Mesmo pub/sub mínimo em memória de activitySessionService.onSessionFinished():
// permite que outras telas (ex.: Central de Insights, F2.4) recalculem seus
// indicadores assim que as metas de tempo (ou outro campo do perfil) mudarem,
// sem precisar recarregar a página nem fazer polling.
const _updateListeners = new Set();

/** Assina notificações de perfil atualizado. Retorna uma função para cancelar a assinatura. */
export function onProfileUpdated(callback) {
  _updateListeners.add(callback);
  return () => _updateListeners.delete(callback);
}

function _notifyProfileUpdated(profile) {
  for (const callback of _updateListeners) {
    try {
      callback(profile);
    } catch (err) {
      console.error("onProfileUpdated listener falhou:", err);
    }
  }
}

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
    // Fechar o dia (F14.8) — ver sql/22_next_study_plan.sql.
    'next_study_title', 'next_study_category_id',
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
  _notifyProfileUpdated(data);
  return data;
}
