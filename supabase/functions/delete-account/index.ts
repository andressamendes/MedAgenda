import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
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

    // Admin client — can delete auth users and bypass RLS
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Delete user data (order respects FK constraints)
    await admin.from("notification_logs").delete().eq("user_id", userId);
    await admin.from("push_subscriptions").delete().eq("user_id", userId);
    await admin.from("events").delete().eq("user_id", userId);
    await admin.from("categories").delete().eq("user_id", userId);

    // Remove avatar files from storage
    const { data: files } = await admin.storage.from("avatars").list(userId);
    if (files?.length) {
      await admin.storage.from("avatars").remove(
        files.map((f) => `${userId}/${f.name}`)
      );
    }

    // Delete auth user — cascades to profiles via FK ON DELETE CASCADE
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return json({ error: deleteError.message }, 500);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
