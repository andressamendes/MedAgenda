import { createClient } from "npm:@supabase/supabase-js@2.110.0";

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

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────
// Exclusão de conta em 3 passos, nada mais: autenticar o chamador, limpar os
// arquivos do bucket `avatars` (Storage não participa das FKs) e apagar o
// usuário em auth.users. Todas as linhas de dados do usuário caem via
// ON DELETE CASCADE das FKs para auth.users — o cascade é o mecanismo oficial
// de limpeza; deletes manuais por tabela são redundantes e foram removidos.

Deno.serve(async (req) => {
  const origin       = req.headers.get("Origin");
  const CORS_HEADERS = corsHeaders(origin);
  const json = (body: unknown, status = 200) => jsonResponse(body, status, CORS_HEADERS);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Não autorizado." }, 401);
    }

    // Verify caller identity using their own JWT
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Não autorizado." }, 401);
    }

    const userId = user.id;

    // Admin client — can delete auth users and access Storage without RLS
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Remove avatar files from storage — before deleteUser, and with errors
    // checked: a orphaned file after the account is gone would be unreachable.
    const { data: files, error: listError } = await admin.storage.from("avatars").list(userId);
    if (listError) {
      console.error("[delete-account] Failed to list avatar files:", listError.message);
      return json({ error: "Falha ao remover arquivos da conta. Tente novamente." }, 500);
    }
    if (files?.length) {
      const { error: removeError } = await admin.storage.from("avatars").remove(
        files.map((f) => `${userId}/${f.name}`)
      );
      if (removeError) {
        console.error("[delete-account] Failed to remove avatar files:", removeError.message);
        return json({ error: "Falha ao remover arquivos da conta. Tente novamente." }, 500);
      }
    }

    // Delete auth user — every user data table cascades via FK ON DELETE CASCADE
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("[delete-account] Failed to delete auth user:", deleteError.message);
      return json({ error: deleteError.message }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("[delete-account] Unexpected error:", err);
    return json({ error: "Erro inesperado ao excluir a conta." }, 500);
  }
});
