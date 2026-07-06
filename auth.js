import { supabase } from "./supabase.js";
import { APP_URL } from "./config.js";

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: _appUrl(),
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: _appUrl(),
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

/**
 * Callback receives (session, event).
 * Relevant events: SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY, TOKEN_REFRESHED.
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session, event);
  });
}

/**
 * A1.4 — Quando o usuário volta ao app a partir de um link de e-mail
 * (recuperação de senha ou confirmação de cadastro) e o token já não é mais
 * válido, o Supabase nunca chega a estabelecer sessão nem a disparar
 * PASSWORD_RECOVERY: em vez disso, ele devolve o motivo diretamente na própria
 * URL de redirecionamento, como `#error=access_denied&error_code=otp_expired`.
 * Sem ler esses parâmetros, esse caso passava batido e o usuário só via a
 * tela de login comum, sem explicação. `errorCode` cobre tanto link expirado
 * quanto link já utilizado — o Supabase invalida o token nos dois casos com
 * o mesmo código, então o app não tem como diferenciá-los.
 */
export function parseAuthRedirectError(href = window.location.href) {
  const url = new URL(href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const error = hashParams.get('error') || url.searchParams.get('error');
  const errorCode = hashParams.get('error_code') || url.searchParams.get('error_code');
  const errorDescription = hashParams.get('error_description') || url.searchParams.get('error_description');
  if (!error && !errorCode) return null;
  return { error, errorCode, errorDescription };
}

/** True quando a URL atual carrega a intenção de recuperação de senha (`type=recovery`). */
export function hasRecoveryIntent(href = window.location.href) {
  const url = new URL(href);
  return url.hash.includes('type=recovery') || url.search.includes('type=recovery');
}

/**
 * Remove os parâmetros de auth (hash/query do link de e-mail) da URL visível,
 * sem recarregar a página — evita que um F5 reprocesse o mesmo erro/token.
 */
export function clearAuthRedirectParams() {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  window.history.replaceState(null, '', url.toString());
}

// APP_URL vem de config.js e garante que os links de e-mail sempre apontem
// para o ambiente correto (produção ou local), independentemente de onde o
// navegador está rodando no momento do envio.
function _appUrl() {
  return APP_URL || (window.location.origin + window.location.pathname);
}
