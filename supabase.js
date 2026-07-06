import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Returns the authenticated user's ID or throws if not signed in. */
export async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  // F4.2 (causa raiz — ETAPA 3): getSession() tenta renovar o token
  // automaticamente quando ele está expirado; se o refresh token também
  // falhar (inválido/ausente/já usado), o auth-js retorna um erro real
  // (AuthApiError, com `__isAuthError`) em vez de lançar. Antes esse erro era
  // descartado e todo caso — sessão realmente ausente ou refresh falho — virava
  // o mesmo texto genérico "Usuário não autenticado.", perdendo o sinal que
  // errorService.categorize() usa para classificar de forma confiável.
  if (error) throw error;
  const id = data.session?.user?.id;
  if (!id) throw new Error("Usuário não autenticado.");
  return id;
}
