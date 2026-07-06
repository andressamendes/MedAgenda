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
  // A1.4 — link de e-mail (recuperação de senha) que voltou ao app com um
  // erro embutido na própria URL (ver auth.js#parseAuthRedirectError):
  // LINK_EXPIRED cobre tanto "expirou" quanto "já foi utilizado" (o Supabase
  // usa o mesmo error_code para os dois); LINK_INVALID cobre qualquer outro
  // caso — token corrompido, ausente, ou um erro que o Supabase não
  // qualificou como expiração.
  LINK_EXPIRED:    'link_expired',
  LINK_INVALID:    'link_invalid',
  // A1.5 — senha atual informada na reautenticação obrigatória (ver
  // auth.js#reauthenticate) não confere com a da conta. auth-js devolve o
  // mesmo `code` ('invalid_credentials') que usa para login malsucedido;
  // este reason/code próprio evita reusar, sem querer, a mensagem de login
  // ("E-mail ou senha incorretos") numa tela que só tem um campo de senha.
  CURRENT_PASSWORD_INCORRECT: 'current_password_incorrect',
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
