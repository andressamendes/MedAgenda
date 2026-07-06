// ── authView.js — Autenticação: login, cadastro, recuperação/redefinição de senha,
//    controle de sessão e alternância entre telas de auth.

import {
  signIn, signUp, signOut, getSession, onAuthStateChange, sendPasswordReset, updatePassword,
  parseAuthRedirectError, hasRecoveryIntent, clearAuthRedirectParams,
} from "./auth.js";
import { track, EVENTS } from "./telemetryService.js";
import { toast } from "./toastService.js";
import { destroyWeekView } from "./weekView.js";
import { handleError } from "./errorService.js";
import { AuthError, AUTH_REASONS } from "./authError.js";

const AUTH_VIEWS = ['login', 'register', 'email-sent', 'forgot', 'reset-sent', 'new-password', 'link-invalid'];

// A1.4 — quando a URL carrega `type=recovery` mas nem PASSWORD_RECOVERY nem
// um erro explícito (parseAuthRedirectError) chegam a aparecer, o token do
// link estava ausente/corrompido de um jeito que o próprio Supabase não
// qualificou como erro. Esse prazo é só a margem para o SDK terminar de
// processar a URL antes de assumirmos que o link nunca vai se resolver.
const RECOVERY_FALLBACK_MS = 4000;

const MODAL_IDS = [
  'event-modal', 'cat-overlay', 'settings-overlay',
  'account-overlay', 'diagnostic-overlay', 'academic-overlay',
  'ai-panel', 'ai-panel-overlay',
];

// ── Module-level state ────────────────────────────────────────────────────────
let _loginScreen       = null;
let _appScreen         = null;
let _appLoading        = null;
let _initializedUserId = null;
let _onSignedIn        = null;
let _onBeforeSignOut   = null;

function _closeAllModals() {
  MODAL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}

export function showAuthView(name) {
  if (_appLoading) _appLoading.hidden = true;
  _closeAllModals();
  destroyWeekView();
  _initializedUserId = null;
  if (_onBeforeSignOut) _onBeforeSignOut();
  _loginScreen.hidden = false;
  _appScreen.hidden   = true;
  AUTH_VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.hidden = (v !== name);
  });
}

export function showLogin() {
  showAuthView('login');
}

/**
 * Exibe a tela de "link inválido" (ETAPA 3) a partir de um erro estruturado
 * — nunca de uma mensagem crua do Supabase. `err` chega já classificado como
 * AuthError (ver _handleAuthRedirect / _armRecoveryFallback abaixo); o texto
 * exibido é sempre o `friendly` devolvido por errorService.handleError().
 */
function _showLinkInvalid(err, fallbackMessage) {
  const { friendly } = handleError(err, {
    context: 'authView.recoveryLink',
    silent: true,
    fallbackMessage,
  });
  const msgEl = document.getElementById('link-invalid-msg');
  if (msgEl) msgEl.textContent = friendly;
  showAuthView('link-invalid');
}

/**
 * Lê a URL uma única vez, no carregamento, para os dois cenários de link de
 * e-mail que o Supabase nunca comunica via onAuthStateChange:
 *
 * 1. O Supabase já rejeitou o token e devolveu o motivo na própria URL
 *    (link expirado ou já utilizado) — parseAuthRedirectError() cobre isso.
 * 2. A URL pede recuperação (`type=recovery`) mas nem sessão nem erro
 *    explícito aparecem dentro do prazo — token ausente/corrompido de um
 *    jeito que o Supabase não chegou a qualificar como erro.
 *
 * Em ambos os casos a URL é limpa (clearAuthRedirectParams) para que um F5
 * não reprocesse o mesmo link. Retorna `true` se um erro explícito já foi
 * tratado (caso 1), para o chamador saber que não precisa armar o fallback
 * do caso 2.
 */
function _handleAuthRedirectError() {
  const redirectError = parseAuthRedirectError();
  if (!redirectError) return false;

  clearAuthRedirectParams();
  const isExpiredOrReused = redirectError.errorCode === 'otp_expired';
  const err = new AuthError(
    redirectError.errorDescription || redirectError.error || 'Recovery link error',
    {
      code:   isExpiredOrReused ? 'recovery_link_expired' : 'recovery_link_invalid',
      reason: isExpiredOrReused ? AUTH_REASONS.LINK_EXPIRED : AUTH_REASONS.LINK_INVALID,
    }
  );
  _showLinkInvalid(err);
  return true;
}

function _armRecoveryFallback() {
  if (!hasRecoveryIntent()) return () => {};
  const timer = setTimeout(() => {
    // ETAPA 4 — se, enquanto esperávamos, uma sessão válida (de outra aba ou
    // já persistida) levou o usuário para dentro do app, não o arranca de lá
    // por causa de um link de recuperação paralelo que nunca se resolveu.
    if (_appScreen && !_appScreen.hidden) return;
    const err = new AuthError('Recovery link missing/corrupt token', {
      code:   'recovery_link_invalid',
      reason: AUTH_REASONS.LINK_INVALID,
    });
    clearAuthRedirectParams();
    _showLinkInvalid(err);
  }, RECOVERY_FALLBACK_MS);
  return () => clearTimeout(timer);
}

/**
 * Fluxo oficial de reautenticação (F4.1, ETAPA 4) — único ponto que qualquer
 * tela deve chamar quando a sessão expira. Nunca deixa o usuário preso numa
 * tela de erro: mesmo que signOut() falhe (sessão já morta no servidor, sem
 * rede, etc.), a tela de login é exibida de qualquer forma, sem depender de
 * um refresh manual.
 */
export async function forceReauth() {
  try {
    await signOut();
  } catch (err) {
    handleError(err, { context: 'authView.forceReauth', silent: true });
  }
  showLogin();
}

// Manages screen transition and guards against double-initialization.
// The actual app initialization is delegated to the onSignedIn callback
// supplied via initAuthView().
export async function showApp(session) {
  if (_appLoading) _appLoading.hidden = true;

  // Both onAuthStateChange (INITIAL_SESSION) and the getSession() IIFE fire on
  // load for the same session. Skip re-initialization for the same user so we
  // don't double-register event listeners or double-fetch data.
  if (_initializedUserId === session.user.id) {
    _loginScreen.hidden = true;
    _appScreen.hidden   = false;
    return;
  }
  _initializedUserId = session.user.id;

  _loginScreen.hidden = true;
  _appScreen.hidden   = false;

  if (_onSignedIn) await _onSignedIn(session);
}

/**
 * initAuthView({ onSignedIn, onBeforeSignOut })
 *
 * onSignedIn(session)   — called once per user session after the auth
 *                         screens are hidden; handles full app bootstrap.
 * onBeforeSignOut()     — called whenever the user signs out or the auth
 *                         view is shown; use to reset cross-domain state.
 */
export function initAuthView({ onSignedIn, onBeforeSignOut } = {}) {
  _loginScreen     = document.getElementById('login-screen');
  _appScreen       = document.getElementById('app-screen');
  _appLoading      = document.getElementById('app-loading');
  _onSignedIn      = onSignedIn;
  _onBeforeSignOut = onBeforeSignOut;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const emailInput    = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const loginBtn      = document.getElementById('btn-login');
  const logoutBtn     = document.getElementById('btn-logout');
  const errorMsg      = document.getElementById('error-msg');

  // ── Login ─────────────────────────────────────────────────────────────────
  loginBtn.addEventListener('click', async () => {
    errorMsg.textContent = '';
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) { errorMsg.textContent = 'Preencha e-mail e senha.'; return; }

    loginBtn.disabled    = true;
    loginBtn.textContent = 'Entrando…';
    try {
      await signIn(email, password);
      passwordInput.value = '';
      track(EVENTS.LOGIN, { email });
    } catch (err) {
      const { friendly } = handleError(err, {
        context: 'authView.login',
        silent: true,
        fallbackMessage: 'Não foi possível fazer login. Tente novamente.',
      });
      errorMsg.textContent = friendly;
    } finally {
      loginBtn.disabled    = false;
      loginBtn.textContent = 'Entrar';
    }
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    try {
      await signOut();
      track(EVENTS.LOGOUT);
    } finally {
      logoutBtn.disabled = false;
    }
  });

  // ── Navegação entre telas de autenticação ─────────────────────────────────
  document.getElementById('btn-to-register')?.addEventListener('click', () => showAuthView('register'));
  document.getElementById('btn-to-login-from-register')?.addEventListener('click', showLogin);
  document.getElementById('btn-to-forgot')?.addEventListener('click', () => showAuthView('forgot'));
  document.getElementById('btn-to-login-from-forgot')?.addEventListener('click', showLogin);
  document.getElementById('btn-back-to-login-from-sent')?.addEventListener('click', showLogin);
  document.getElementById('btn-back-to-login-from-reset')?.addEventListener('click', showLogin);
  document.getElementById('btn-back-to-login-from-invalid')?.addEventListener('click', showLogin);
  document.getElementById('btn-request-new-link')?.addEventListener('click', () => showAuthView('forgot'));
  document.getElementById('btn-request-new-link-from-new-password')?.addEventListener('click', () => showAuthView('forgot'));

  // ── Cadastro ──────────────────────────────────────────────────────────────
  const registerBtn   = document.getElementById('btn-register');
  const registerError = document.getElementById('register-error');

  registerBtn?.addEventListener('click', async () => {
    if (!registerError) return;
    registerError.textContent = '';

    const fullName = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const pwd      = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;
    const terms    = document.getElementById('reg-terms').checked;

    if (!fullName)      { registerError.textContent = 'Nome é obrigatório.'; return; }
    if (!email)         { registerError.textContent = 'E-mail é obrigatório.'; return; }
    if (pwd.length < 8) { registerError.textContent = 'A senha deve ter pelo menos 8 caracteres.'; return; }
    if (pwd !== confirm) { registerError.textContent = 'As senhas não coincidem.'; return; }
    if (!terms)         { registerError.textContent = 'Aceite os Termos de Uso para continuar.'; return; }

    registerBtn.disabled    = true;
    registerBtn.textContent = 'Criando conta…';
    try {
      const { user } = await signUp(email, pwd, fullName);

      // user === null  → Supabase email-enumeration protection: e-mail já existe
      // identities: [] → Supabase comportamento antigo: e-mail já existe
      // Não tratar identities === undefined como "já cadastrado": o campo é opcional
      //   no tipo UserIdentity do SDK e sua ausência não indica duplicidade.
      const alreadyExists =
        user === null ||
        (Array.isArray(user.identities) && user.identities.length === 0);

      if (alreadyExists) {
        registerError.textContent = 'Este e-mail já está cadastrado. Faça login.';
        return;
      }

      track(EVENTS.SIGNUP, { email });
      document.getElementById('email-sent-addr').textContent = email;
      showAuthView('email-sent');
    } catch (err) {
      const { friendly } = handleError(err, {
        context: 'authView.signup',
        silent: true,
        fallbackMessage: 'Não foi possível criar a conta. Tente novamente.',
      });
      registerError.textContent = friendly;
    } finally {
      registerBtn.disabled    = false;
      registerBtn.textContent = 'Criar Conta';
    }
  });

  // ── Recuperação de senha ──────────────────────────────────────────────────
  const sendResetBtn = document.getElementById('btn-send-reset');
  const forgotError  = document.getElementById('forgot-error');

  sendResetBtn?.addEventListener('click', async () => {
    if (!forgotError) return;
    forgotError.textContent = '';

    const email = document.getElementById('forgot-email').value.trim();
    if (!email) { forgotError.textContent = 'Informe seu e-mail.'; return; }

    sendResetBtn.disabled    = true;
    sendResetBtn.textContent = 'Enviando…';
    try {
      await sendPasswordReset(email);
      showAuthView('reset-sent');
    } catch (err) {
      const { friendly } = handleError(err, {
        context: 'authView.forgotPassword',
        silent: true,
        fallbackMessage: 'Não foi possível enviar o link. Tente novamente.',
      });
      forgotError.textContent = friendly;
    } finally {
      sendResetBtn.disabled    = false;
      sendResetBtn.textContent = 'Enviar link';
    }
  });

  // ── Redefinição de senha (após clicar no link de reset) ───────────────────
  const setPasswordBtn = document.getElementById('btn-set-password');
  const newPwdError    = document.getElementById('new-pwd-error');

  setPasswordBtn?.addEventListener('click', async () => {
    if (!newPwdError) return;
    newPwdError.textContent = '';

    const pwd     = document.getElementById('new-password').value;
    const confirm = document.getElementById('new-password-confirm').value;

    if (pwd.length < 8)  { newPwdError.textContent = 'A senha deve ter pelo menos 8 caracteres.'; return; }
    if (pwd !== confirm)  { newPwdError.textContent = 'As senhas não coincidem.'; return; }

    setPasswordBtn.disabled    = true;
    setPasswordBtn.textContent = 'Salvando…';
    try {
      await updatePassword(pwd);
      toast.success('Senha definida com sucesso. Você já pode fazer login.');
      showLogin();
    } catch (err) {
      const { friendly } = handleError(err, {
        context: 'authView.setPassword',
        silent: true,
        fallbackMessage: 'Não foi possível definir a senha.',
      });
      newPwdError.textContent = friendly;
    } finally {
      setPasswordBtn.disabled    = false;
      setPasswordBtn.textContent = 'Definir senha';
    }
  });

  // ── Controle de sessão ────────────────────────────────────────────────────
  // A1.4 — resolvido de forma síncrona, antes de qualquer outro fluxo: se o
  // link de e-mail já voltou com um erro explícito na URL, nem
  // onAuthStateChange nem getSession() devem decidir a tela (ambos veriam
  // "sem sessão" e mostrariam o login comum, apagando a explicação que
  // acabamos de exibir). `_clearRecoveryFallback` cancela o prazo do caso
  // "token ausente/corrompido" assim que PASSWORD_RECOVERY chega a disparar.
  const _redirectErrorHandled = _handleAuthRedirectError();
  const _clearRecoveryFallback = _redirectErrorHandled ? () => {} : _armRecoveryFallback();

  // If neither onAuthStateChange nor getSession() resolves within 10s (e.g.
  // Supabase unreachable, token refresh hanging), force the login screen so
  // the user is never stuck on the splash forever.
  const _authSafetyTimer = setTimeout(() => {
    if (_appLoading && !_appLoading.hidden) showLogin();
  }, 10000);

  onAuthStateChange((session, event) => {
    clearTimeout(_authSafetyTimer);
    if (event === 'PASSWORD_RECOVERY') {
      _clearRecoveryFallback();
      showAuthView('new-password');
      return;
    }
    if (_redirectErrorHandled) return;
    if (session) showApp(session);
    else showLogin();
  });

  (async () => {
    if (_redirectErrorHandled) { clearTimeout(_authSafetyTimer); return; }
    const session = await getSession();
    if (session) showApp(session);
    else showLogin();
  })().catch((err) => {
    // getSession() threw (network error, Supabase error, etc.).
    // onAuthStateChange should handle this too, but fall back to login
    // in case it also hangs or never fires.
    handleError(err, { context: 'authView.getSession', silent: true });
    clearTimeout(_authSafetyTimer);
    if (!_redirectErrorHandled) showLogin();
  });
}
