// ── authView.js — Autenticação: login, cadastro, recuperação/redefinição de senha,
//    controle de sessão e alternância entre telas de auth.

import { signIn, signUp, signOut, getSession, onAuthStateChange, sendPasswordReset, updatePassword } from "./auth.js";
import { track, EVENTS } from "./telemetryService.js";
import { toast } from "./toastService.js";
import { destroyWeekView } from "./weekView.js";

const AUTH_VIEWS = ['login', 'register', 'email-sent', 'forgot', 'reset-sent', 'new-password'];

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
      const msg = err.message || '';
      if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) {
        errorMsg.textContent = 'E-mail ou senha incorretos. Verifique suas credenciais.';
      } else if (msg.includes('Email not confirmed')) {
        errorMsg.textContent = 'Confirme seu e-mail antes de fazer login.';
      } else {
        errorMsg.textContent = 'Não foi possível fazer login. Tente novamente.';
      }
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
      const msg = err.message || '';
      console.error('[cadastro] exceção capturada:', err);
      if (msg.includes('already registered') || msg.includes('already exists')) {
        registerError.textContent = 'Este e-mail já está cadastrado. Faça login.';
      } else {
        registerError.textContent = msg || 'Não foi possível criar a conta. Tente novamente.';
      }
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
      forgotError.textContent = err.message || 'Não foi possível enviar o link. Tente novamente.';
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
      newPwdError.textContent = err.message || 'Não foi possível definir a senha.';
    } finally {
      setPasswordBtn.disabled    = false;
      setPasswordBtn.textContent = 'Definir senha';
    }
  });

  // ── Controle de sessão ────────────────────────────────────────────────────
  // If neither onAuthStateChange nor getSession() resolves within 10s (e.g.
  // Supabase unreachable, token refresh hanging), force the login screen so
  // the user is never stuck on the splash forever.
  const _authSafetyTimer = setTimeout(() => {
    if (_appLoading && !_appLoading.hidden) showLogin();
  }, 10000);

  onAuthStateChange((session, event) => {
    clearTimeout(_authSafetyTimer);
    if (event === 'PASSWORD_RECOVERY') {
      showAuthView('new-password');
      return;
    }
    if (session) showApp(session);
    else showLogin();
  });

  (async () => {
    const session = await getSession();
    if (session) showApp(session);
    else showLogin();
  })().catch(() => {
    // getSession() threw (network error, Supabase error, etc.).
    // onAuthStateChange should handle this too, but fall back to login
    // in case it also hangs or never fires.
    clearTimeout(_authSafetyTimer);
    showLogin();
  });
}
