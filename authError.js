/**
 * A1.2 — Contrato estruturado para erros de autenticação.
 *
 * Antes desta etapa, supabase.currentUserId() sinalizava "sessão inexistente"
 * lançando um Error comum com um texto fixo ("Usuário não autenticado."), e
 * errorService.categorize() reconhecia esse caso procurando esse mesmo texto
 * na mensagem (`msg.includes('não autenticado')`). Isso acopla os dois
 * módulos a um texto específico: se a mensagem mudasse (ex.: i18n, ajuste de
 * copy), a classificação quebraria silenciosamente.
 *
 * AuthError substitui esse texto por um formato estruturado, no mesmo padrão
 * que os erros reais do auth-js do Supabase já usam (`__isAuthError: true`),
 * para que errorService.categorize() continue reconhecendo qualquer erro de
 * autenticação — seja do SDK, seja gerado aqui — sem depender de mensagem,
 * idioma ou substring. A mensagem em si (`err.message`) segue existindo só
 * para log/depuração, nunca como entrada de classificação.
 */

export const AUTH_REASONS = {
  NO_SESSION:      'no_session',
  SESSION_EXPIRED: 'session_expired',
  REFRESH_INVALID: 'refresh_invalid',
  INVALID_JWT:     'invalid_jwt',
  USER_NOT_FOUND:  'user_not_found',
};

export class AuthError extends Error {
  constructor(message, {
    code = null,
    status = 401,
    reason = AUTH_REASONS.NO_SESSION,
    recoverable = true,
    originalError = null,
  } = {}) {
    super(message);
    this.name = 'AuthError';
    // Mesma flag usada pelo auth-js do Supabase (GoTrueClient) para marcar
    // qualquer erro de autenticação, independentemente da subclasse — é o
    // único sinal que errorService.categorize() precisa para reconhecer este
    // erro como 'auth', sem duplicar a lógica de classificação aqui.
    this.__isAuthError = true;
    this.code = code;
    this.status = status;
    this.reason = reason;
    this.recoverable = recoverable;
    this.originalError = originalError;
  }
}
