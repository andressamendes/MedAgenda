import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";

// ── Prompt builders ────────────────────────────────────────────────────────────

function buildWeeklySummaryPrompt(payload: PromptPayload): string {
  const { events, weekStart, weekEnd } = payload;
  const evList = events.map(e => {
    const parts = [e.date, e.start_time, e.title, e.category, e.duration_minutes ? `${e.duration_minutes}min` : null, e.location]
      .filter(Boolean).join(' | ');
    return `- ${parts}`;
  }).join('\n') || '(nenhum evento na semana)';

  return `Você é um assistente de agenda para estudantes de medicina.
Analise os compromissos da semana de ${weekStart} a ${weekEnd} e forneça um resumo objetivo e útil em português.
Destaque: carga de trabalho, dias mais pesados, distribuição de atividades e observações relevantes.
Seja conciso (máx. 200 palavras) e use linguagem encorajadora.

Eventos da semana:
${evList}`;
}

function buildStudySuggestionPrompt(payload: PromptPayload): string {
  const { events, rangeStart, rangeEnd } = payload;
  const evList = events.map(e => {
    const end = e.start_time && e.duration_minutes
      ? addMinutes(e.start_time, e.duration_minutes) : null;
    const time = e.start_time ? `${e.start_time}${end ? '–' + end : ''}` : 'horário não definido';
    return `- ${e.date} ${time}: ${e.title}${e.category ? ` (${e.category})` : ''}`;
  }).join('\n') || '(nenhum evento no período)';

  return `Você é um assistente de agenda para estudantes de medicina.
Com base nos compromissos dos próximos 14 dias (${rangeStart} a ${rangeEnd}), sugira horários específicos para estudo.
Considere: lacunas entre compromissos, dias mais livres e evite sugerir horários noturnos tardios após plantões.
Forneça 3 a 5 sugestões concretas com dia e horário em português. Seja objetivo (máx. 200 palavras).

Compromissos existentes:
${evList}`;
}

function buildScheduleAnalysisPrompt(payload: PromptPayload): string {
  const { events, rangeStart, rangeEnd } = payload;
  const evList = events.map(e => {
    const end = e.start_time && e.duration_minutes
      ? addMinutes(e.start_time, e.duration_minutes) : null;
    const time = e.start_time ? `${e.start_time}${end ? '–' + end : ''}` : 'horário não definido';
    return `- ${e.date} ${time}: ${e.title}${e.category ? ` (${e.category})` : ''}`;
  }).join('\n') || '(nenhum evento no período)';

  return `Você é um assistente de agenda para estudantes de medicina.
Analise os compromissos dos próximos 30 dias (${rangeStart} a ${rangeEnd}) e identifique:
1. Conflitos de horário
2. Excesso de carga em dias ou semanas específicos
3. Riscos de esgotamento (ex: plantões seguidos de aulas cedo)
4. Sugestões de ajuste

Responda em português, de forma estruturada e objetiva (máx. 250 palavras).

Compromissos:
${evList}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventItem {
  title:            string;
  date:             string;
  start_time?:      string | null;
  duration_minutes?: number | null;
  category?:        string | null;
  location?:        string | null;
}

interface PromptPayload {
  type:       string;
  events:     EventItem[];
  weekStart?: string;
  weekEnd?:   string;
  rangeStart?: string;
  rangeEnd?:   string;
  model?:       string;
  temperature?: number;
  maxTokens?:   number;
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const startedAt = Date.now();
  let promptType = 'unknown';

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Token de autenticação ausente." }, 401);
    }

    const supabaseUrl      = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey  = Deno.env.get("SUPABASE_ANON_KEY")!;
    const geminiApiKey     = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      console.error("[ai-chat] GEMINI_API_KEY not configured");
      return jsonResponse({ error: "Serviço de IA não configurado." }, 503);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Sessão inválida ou expirada." }, 401);
    }

    // ── Input validation ────────────────────────────────────────────────────
    let payload: PromptPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo da requisição inválido." }, 400);
    }

    const VALID_TYPES = ['weekly_summary', 'study_suggestion', 'schedule_analysis'];
    if (!payload?.type || !VALID_TYPES.includes(payload.type)) {
      return jsonResponse({ error: `Tipo de prompt inválido. Use: ${VALID_TYPES.join(', ')}.` }, 400);
    }
    if (!Array.isArray(payload.events)) {
      return jsonResponse({ error: "Campo 'events' deve ser um array." }, 400);
    }
    if (payload.events.length > 500) {
      return jsonResponse({ error: "Número de eventos excede o limite (500)." }, 400);
    }

    promptType = payload.type;

    // ── Build prompt ────────────────────────────────────────────────────────
    let prompt: string;
    if (payload.type === 'weekly_summary')    prompt = buildWeeklySummaryPrompt(payload);
    else if (payload.type === 'study_suggestion') prompt = buildStudySuggestionPrompt(payload);
    else                                      prompt = buildScheduleAnalysisPrompt(payload);

    const model       = payload.model ?? 'gemini-2.5-flash';
    const temperature = typeof payload.temperature === 'number' ? payload.temperature : 0.7;
    const maxTokens   = typeof payload.maxTokens   === 'number' ? payload.maxTokens   : 1024;

    // ── Call Gemini ─────────────────────────────────────────────────────────
    const geminiRes = await fetch(
      `${GEMINI_API}/${model}:generateContent?key=${geminiApiKey}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
      }
    );

    const elapsed = Date.now() - startedAt;
    console.log(`[ai-chat] type=${promptType} user=${user.id} status=${geminiRes.status} ms=${elapsed}`);

    if (geminiRes.status === 429) {
      return jsonResponse({ error: "Limite de requisições do serviço de IA atingido. Aguarde e tente novamente." }, 429);
    }
    if (geminiRes.status === 401 || geminiRes.status === 403) {
      console.error("[ai-chat] Gemini auth error:", geminiRes.status);
      return jsonResponse({ error: "Erro de autenticação com o serviço de IA." }, 503);
    }
    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      console.error("[ai-chat] Gemini error:", geminiRes.status, errBody);
      return jsonResponse({ error: "Erro ao contatar o serviço de IA. Tente novamente." }, 502);
    }

    const geminiBody = await geminiRes.json();
    const text = geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text) {
      console.warn("[ai-chat] Empty response from Gemini");
      return jsonResponse({ error: "O serviço de IA retornou uma resposta vazia. Tente novamente." }, 502);
    }

    return jsonResponse({ text, ms: elapsed });

  } catch (err) {
    const elapsed = Date.now() - startedAt;
    console.error(`[ai-chat] Unexpected error type=${promptType} ms=${elapsed}:`, err);
    return jsonResponse({ error: "Erro interno do servidor. Tente novamente." }, 500);
  }
});
