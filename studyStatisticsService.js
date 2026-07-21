// ── studyStatisticsService.js — Estatísticas de Questões (F17) ─────────────
// Único responsável por agregação de desempenho (total/acertos/erros/%) —
// nenhuma view/service consome mais isso "na mão" somando arrays de
// questions client-side. Duas superfícies:
//
//   - getUserQuestionStatistics(filters): estatísticas globais do usuário,
//     agregadas no próprio Postgres via RPC (sql/25_question_results.sql,
//     get_question_statistics) — evita trazer todas as linhas de `questions`
//     para o cliente só para somar. RLS de `questions`/`activity_sessions`
//     já escopa por usuário dentro da função (SECURITY INVOKER).
//
//   - summarizeSessionQuestions(questions): resumo de uma lista de questões
//     JÁ carregada (ex.: o retorno em lote de
//     sessionQuestionsService.listQuestionsBySessions(), reaproveitado pelo
//     Diário de Estudos) — função pura, sem I/O, para o card "QUESTÕES" de
//     cada sessão. Nenhuma consulta nova é feita para isso.

import { supabase } from "./supabase.js";

function _startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function _isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "today"/"week"/"month" resolvem para [início, hoje]; "custom" usa
// filters.startDate/filters.endDate (strings YYYY-MM-DD) informados pelo
// chamador; ausência de period (ou period "all") não filtra por data.
function _resolveDateRange(filters) {
  const { period, startDate, endDate } = filters;
  if (period === "custom") {
    return { start: startDate || null, end: endDate || null };
  }
  if (!period || period === "all") return { start: null, end: null };

  const today = _startOfDay(new Date());
  let start;
  if (period === "today") start = today;
  else if (period === "week") start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  else if (period === "month") start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  else start = null;

  return { start: start ? _isoDate(start) : null, end: _isoDate(today) };
}

/** Percentual de acerto (0–100, arredondado), evitando divisão por zero. */
export function calculateAccuracyPercent(correct, total) {
  if (!total) return 0;
  return Math.round((correct / total) * 100);
}

// ── API pública ──────────────────────────────────────────────────────────

/**
 * getUserQuestionStatistics({ period, startDate, endDate, categoryId, subject })
 * → { total, correct, incorrect, accuracyPercent }
 *
 * `period`: "today" | "week" | "month" | "custom" | "all" (padrão).
 * `startDate`/`endDate`: só usados com period "custom" (YYYY-MM-DD).
 * `categoryId`: UUID de public.categories (activity_sessions.category_id).
 * `subject`: texto livre, casado por ILIKE contra questions.subject.
 */
export async function getUserQuestionStatistics(filters = {}) {
  const { start, end } = _resolveDateRange(filters);
  const { data, error } = await supabase.rpc("get_question_statistics", {
    p_start: start,
    p_end: end,
    p_category_id: filters.categoryId || null,
    p_subject: filters.subject || null,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  const total = row?.total || 0;
  const correct = row?.correct || 0;
  const incorrect = row?.incorrect || 0;
  return { total, correct, incorrect, accuracyPercent: calculateAccuracyPercent(correct, total) };
}

/**
 * Resumo de uma lista de questões já carregada (sem I/O) — soma
 * correct_count/incorrect_count de cada lançamento. Lançamentos antigos
 * (sem os campos, F17) contam 0/0 automaticamente (default do banco).
 */
export function summarizeSessionQuestions(questions) {
  const list = questions || [];
  const correct = list.reduce((sum, q) => sum + (q.correct_count || 0), 0);
  const incorrect = list.reduce((sum, q) => sum + (q.incorrect_count || 0), 0);
  const total = correct + incorrect;
  return { total, correct, incorrect, accuracyPercent: calculateAccuracyPercent(correct, total) };
}

/** 🟢 ≥70% · 🟡 50–69% · 🔴 <50% — único ponto de decisão do indicador visual. */
export function accuracyIndicator(accuracyPercent) {
  if (accuracyPercent >= 70) return { emoji: "🟢", level: "high" };
  if (accuracyPercent >= 50) return { emoji: "🟡", level: "medium" };
  return { emoji: "🔴", level: "low" };
}
