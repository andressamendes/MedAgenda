// ── questionService.js — Infraestrutura do domínio Questões (F6.7) ──────────
// CRUD puro sobre public.questions, seguindo exatamente o padrão de
// eventService/reviewService/activitySessionService: nenhuma regra de
// negócio, nenhum evento publicado, nenhum cálculo de desempenho. Uma
// questão sempre pertence a uma sessão (session_id obrigatório) — nunca ao
// Dashboard, ao Perfil ou às Categorias (F6.1). Consumidores (estatísticas,
// acertos/erros, conquistas) serão conectados em etapa futura.

import { supabase, currentUserId } from "./supabase.js";

export async function createQuestion(fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("questions")
    .insert({ ...fields, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getQuestionById(id) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getQuestions() {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateQuestion(id, fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("questions")
    .update(fields)
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteQuestion(id) {
  const user_id = await currentUserId();
  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", id)
    .eq("user_id", user_id);
  if (error) throw error;
}

// Questões de uma sessão específica — a única forma de listagem prevista
// nesta etapa, já que "Questões nunca existem sem Sessão" (F6.1).
export async function listBySession(sessionId) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("user_id", user_id)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

// Questões de várias sessões de uma só vez, agrupadas por session_id — para
// telas que renderizam muitas sessões ao mesmo tempo (Diário de Estudos,
// AUD-002): uma única consulta com `in` evita o N+1 de chamar listBySession()
// por sessão.
export async function listBySessions(sessionIds) {
  const ids = [...new Set((sessionIds || []).filter(Boolean))];
  if (ids.length === 0) return {};

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("user_id", user_id)
    .in("session_id", ids)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const bySession = {};
  for (const id of ids) bySession[id] = [];
  for (const question of data) {
    if (bySession[question.session_id]) bySession[question.session_id].push(question);
  }
  return bySession;
}
