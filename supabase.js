import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { AuthError, AUTH_REASONS } from "./authError.js";

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
  // A1.2: nenhuma sessão e nenhum erro do SDK significa que o usuário nunca
  // autenticou (ou já fez signOut) — um caso estruturalmente diferente de um
  // erro do auth-js, mas ainda assim um erro de autenticação. Usa o mesmo
  // contrato (AuthError) em vez de um Error genérico, para que
  // errorService.categorize() o reconheça pela flag `__isAuthError`, nunca
  // pelo texto da mensagem.
  if (!id) {
    throw new AuthError("Usuário não autenticado.", {
      code: "session_not_found",
      reason: AUTH_REASONS.NO_SESSION,
    });
  }
  return id;
}
