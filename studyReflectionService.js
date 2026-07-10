// ── studyReflectionService.js — Infraestrutura do domínio Reflexão (F8.2) ──
// CRUD puro sobre public.reflections, seguindo o mesmo padrão de
// questionService.js/reviewService.js: nenhuma regra de negócio, nenhum
// evento publicado, nenhum cálculo. Uma Reflexão sempre pertence a uma
// Sessão (session_id obrigatório, no máximo uma por sessão — garantido pela
// UNIQUE constraint de sql/18_reflections.sql) e pertence exclusivamente ao
// Diário de Estudos: nunca ao Dashboard, à IA, às Conquistas, ao Progresso
// ou às Estatísticas. Reflexão é distinta de Observações
// (activity_sessions.notes) — este arquivo não lê nem escreve `notes`.

import { supabase, currentUserId } from "./supabase.js";

function _domainError(message, code) {
  const err = new Error(message);
  err.code = code;
  err.context = "studyReflectionService";
  return err;
}

// Leitura da reflexão de uma sessão específica — a única forma de consulta
// prevista, já que "Reflexão nunca existe sem Sessão". `null` cobre tanto
// "sessão sem reflexão ainda" quanto qualquer sessão de outro usuário (RLS).
export async function getBySession(sessionId) {
  if (!sessionId) {
    throw _domainError("Reflexão precisa estar vinculada a uma sessão.", "SESSION_ID_REQUIRED");
  }

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("reflections")
    .select("*")
    .eq("user_id", user_id)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Reflexões de várias sessões de uma só vez, mapeadas por session_id — para
// telas que renderizam muitas sessões ao mesmo tempo (Diário de Estudos,
// AUD-002): uma única consulta com `in` evita o N+1 de chamar getBySession()
// por sessão. Sessões sem reflexão simplesmente não aparecem no mapa
// resultante (mesmo sentido de `null` em getBySession()).
export async function listBySessions(sessionIds) {
  const ids = [...new Set((sessionIds || []).filter(Boolean))];
  if (ids.length === 0) return {};

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("reflections")
    .select("*")
    .eq("user_id", user_id)
    .in("session_id", ids);
  if (error) throw error;

  const bySession = {};
  for (const reflection of data) bySession[reflection.session_id] = reflection;
  return bySession;
}

// Cria ou edita a reflexão da sessão (no máximo uma por sessão) — UPSERT por
// session_id, o mesmo conflito que a UNIQUE constraint do banco impõe, para
// que "Adicionar reflexão" e "Editar reflexão" sejam a mesma operação do
// ponto de vista do domínio.
export async function saveReflection(sessionId, content) {
  if (!sessionId) {
    throw _domainError("Reflexão precisa estar vinculada a uma sessão.", "SESSION_ID_REQUIRED");
  }
  const trimmed = (content ?? "").trim();
  if (!trimmed) {
    throw _domainError("Reflexão não pode ficar vazia.", "CONTENT_REQUIRED");
  }

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("reflections")
    .upsert({ session_id: sessionId, user_id, content: trimmed }, { onConflict: "session_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}
