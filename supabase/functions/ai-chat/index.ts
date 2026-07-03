import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";

// ── CORS ─────────────────────────────────────────────────────────────────────
// Only the official production origin (GitHub Pages) and local dev servers
// (any port on localhost/127.0.0.1) may call this function from a browser.
const PROD_ORIGIN = "https://andressamendes.github.io";
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin: string | null): boolean {
  return !!origin && (origin === PROD_ORIGIN || LOCAL_ORIGIN_RE.test(origin));
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin":  isAllowedOrigin(origin) ? origin! : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

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

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
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

// ── Métricas (ai_metrics) ──────────────────────────────────────────────────────
// Observabilidade mínima: cada retorno registra uma linha em ai_metrics
// (tipo de prompt, modelo, duração, status HTTP, sucesso/falha e um código +
// resumo curto de erro) sem armazenar prompt, resposta da IA, JWT ou
// qualquer dado pessoal. Requer SUPABASE_SERVICE_ROLE_KEY porque a policy de
// ai_metrics só permite INSERT via service_role (ver sql/08_ai_metrics.sql).

function summarizeError(message: string, max = 200): string {
  return message.length > max ? `${message.slice(0, max)}…` : message;
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin       = req.headers.get("Origin");
  const CORS_HEADERS = corsHeaders(origin);
  const json = (body: unknown, status = 200) => jsonResponse(body, status, CORS_HEADERS);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const startedAt = Date.now();
  let promptType = 'unknown';
  let model: string | null = null;
  let userId: string | null = null;

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminClient    = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  // Responde ao cliente exatamente como `json()` fazia antes, e além disso
  // grava a métrica da chamada em background (não bloqueia nem altera a
  // resposta). Só grava quando o usuário já foi autenticado — ai_metrics.user_id
  // é NOT NULL por design, então falhas de autenticação do requisitante (antes
  // de sabermos quem é o usuário) não geram linha.
  function finish(body: unknown, status: number, errorCode: string | null = null, errorMessage: string | null = null): Response {
    if (adminClient && userId) {
      const uid      = userId;
      const duration = Date.now() - startedAt;
      const metric = (async () => {
        try {
          const { error } = await adminClient.from("ai_metrics").insert({
            user_id:       uid,
            prompt_type:   promptType,
            model,
            duration_ms:   duration,
            success:       status < 400,
            http_status:   status,
            error_code:    errorCode,
            error_message: errorMessage ? summarizeError(errorMessage) : null,
          });
          if (error) console.error("[ai-chat] Failed to record metric:", error.message);
        } catch (err) {
          console.error("[ai-chat] Failed to record metric:", err);
        }
      })();
      // @ts-ignore — global do runtime de Edge Functions do Supabase (Deno Deploy), sem tipos no lib padrão.
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(metric);
    }
    return json(body, status);
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return finish({ error: "Token de autenticação ausente." }, 401, "missing_token");
    }

    const supabaseAnonKey  = Deno.env.get("SUPABASE_ANON_KEY")!;
    const geminiApiKey     = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      console.error("[ai-chat] GEMINI_API_KEY not configured");
      return finish({ error: "Serviço de IA não configurado." }, 503, "misconfigured");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return finish({ error: "Sessão inválida ou expirada." }, 401, "invalid_session");
    }
    userId = user.id;

    // ── Input validation ────────────────────────────────────────────────────
    let payload: PromptPayload;
    try {
      payload = await req.json();
    } catch {
      return finish({ error: "Corpo da requisição inválido." }, 400, "invalid_body", "Corpo da requisição inválido.");
    }

    const VALID_TYPES = ['weekly_summary', 'study_suggestion', 'schedule_analysis'];
    if (!payload?.type || !VALID_TYPES.includes(payload.type)) {
      return finish({ error: `Tipo de prompt inválido. Use: ${VALID_TYPES.join(', ')}.` }, 400, "invalid_type", "Tipo de prompt inválido.");
    }
    if (!Array.isArray(payload.events)) {
      return finish({ error: "Campo 'events' deve ser um array." }, 400, "invalid_events", "Campo 'events' inválido.");
    }
    if (payload.events.length > 500) {
      return finish({ error: "Número de eventos excede o limite (500)." }, 400, "events_limit_exceeded", "Número de eventos excede o limite.");
    }

    promptType = payload.type;

    // ── Build prompt ────────────────────────────────────────────────────────
    let prompt: string;
    if (payload.type === 'weekly_summary')    prompt = buildWeeklySummaryPrompt(payload);
    else if (payload.type === 'study_suggestion') prompt = buildStudySuggestionPrompt(payload);
    else                                      prompt = buildScheduleAnalysisPrompt(payload);

    model = payload.model ?? 'gemini-2.5-flash';
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
      return finish({ error: "Limite de requisições do serviço de IA atingido. Aguarde e tente novamente." }, 429, "gemini_rate_limit", "Rate limit do Gemini atingido.");
    }
    if (geminiRes.status === 401 || geminiRes.status === 403) {
      console.error("[ai-chat] Gemini auth error:", geminiRes.status);
      return finish({ error: "Erro de autenticação com o serviço de IA." }, 503, "gemini_auth_error", `Erro de autenticação com Gemini (status ${geminiRes.status}).`);
    }
    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      console.error("[ai-chat] Gemini error:", geminiRes.status, errBody);
      return finish({ error: "Erro ao contatar o serviço de IA. Tente novamente." }, 502, "gemini_upstream_error", `Erro upstream do Gemini (status ${geminiRes.status}).`);
    }

    const geminiBody = await geminiRes.json();
    const text = geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text) {
      console.warn("[ai-chat] Empty response from Gemini");
      return finish({ error: "O serviço de IA retornou uma resposta vazia. Tente novamente." }, 502, "empty_response", "Resposta vazia do Gemini.");
    }

    return finish({ text, ms: elapsed }, 200);

  } catch (err) {
    const elapsed = Date.now() - startedAt;
    console.error(`[ai-chat] Unexpected error type=${promptType} ms=${elapsed}:`, err);
    return finish({ error: "Erro interno do servidor. Tente novamente." }, 500, "internal_error", "Erro interno inesperado.");
  }
});
