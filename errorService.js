import { showToast } from './toastService.js';
import { track, EVENTS } from './telemetryService.js';

const CATEGORIES = {
  AUTH:     'auth',
  NETWORK:  'network',
  DATABASE: 'database',
  PUSH:     'push',
  SW:       'service_worker',
  UI:       'ui',
  UNKNOWN:  'unknown',
};

const _logs = [];
const MAX_LOGS = 100;
let _devMode = false;
let _installed = false;

export function initErrorService(devMode = false) {
  if (_installed) return;
  _installed = true;
  _devMode = devMode;

  window.addEventListener('error', (evt) => {
    handleError(evt.error || new Error(evt.message), {
      context: 'window.onerror',
      source: evt.filename,
      line: evt.lineno,
      silent: true,
    });
  });

  window.addEventListener('unhandledrejection', (evt) => {
    handleError(evt.reason, {
      context: 'unhandledrejection',
      silent: true,
    });
    evt.preventDefault();
  });
}

export function setErrorDevMode(enabled) {
  _devMode = enabled;
}

function categorize(err) {
  if (!err) return CATEGORIES.UNKNOWN;
  const msg = String(err?.message || err).toLowerCase();
  const code = String(err?.code || '');

  if (
    msg.includes('jwt') || msg.includes('não autenticado') ||
    msg.includes('invalid login') || msg.includes('invalid_credentials') ||
    msg.includes('email not confirmed') || msg.includes('session') ||
    code === 'PGRST301'
  ) return CATEGORIES.AUTH;

  if (
    msg.includes('failed to fetch') || msg.includes('networkerror') ||
    msg.includes('load failed') || msg.includes('offline') ||
    msg.includes('network request') || msg.includes('net::')
  ) return CATEGORIES.NETWORK;

  if (
    msg.includes('supabase') || code.startsWith('PGRST') ||
    msg.includes('database') || code.startsWith('23') || code.startsWith('42')
  ) return CATEGORIES.DATABASE;

  if (
    msg.includes('push') || msg.includes('vapid') ||
    msg.includes('subscription') || msg.includes('pushmanager')
  ) return CATEGORIES.PUSH;

  if (
    msg.includes('service worker') || msg.includes('serviceworker') ||
    msg.includes('cache storage')
  ) return CATEGORIES.SW;

  return CATEGORIES.UNKNOWN;
}

const FRIENDLY = {
  [CATEGORIES.AUTH]: {
    default:      'Sua sessão expirou. Faça login novamente.',
    invalid:      'E-mail ou senha incorretos. Verifique suas credenciais.',
    unconfirmed:  'Confirme seu e-mail antes de fazer login.',
  },
  [CATEGORIES.NETWORK]:  'Sem conexão com a internet. Verifique sua rede e tente novamente.',
  [CATEGORIES.DATABASE]: {
    default:  'Erro ao comunicar com o servidor. Tente novamente em instantes.',
    duplicate:'Já existe um registro com essas informações.',
  },
  [CATEGORIES.PUSH]:  'Erro ao configurar notificações. Verifique as permissões do navegador.',
  [CATEGORIES.SW]:    'Erro no serviço em segundo plano. Recarregue a página.',
  [CATEGORIES.UNKNOWN]:'Algo deu errado. Tente novamente.',
};

function friendlyMessage(category, err) {
  const msg = String(err?.message || '').toLowerCase();

  if (category === CATEGORIES.AUTH) {
    if (msg.includes('invalid') || msg.includes('credentials')) return FRIENDLY.auth.invalid;
    if (msg.includes('confirmed'))                               return FRIENDLY.auth.unconfirmed;
    return FRIENDLY.auth.default;
  }

  if (category === CATEGORIES.DATABASE) {
    if (msg.includes('23505') || msg.includes('duplicate')) return FRIENDLY.database.duplicate;
    return FRIENDLY.database.default;
  }

  const mapped = FRIENDLY[category];
  if (typeof mapped === 'string') return mapped;

  // Use original message if it looks user-friendly (short, Portuguese, no stack noise)
  const original = err?.message || '';
  if (
    original.length > 0 && original.length < 160 &&
    !original.includes('TypeError') && !original.includes('Cannot read') &&
    !original.includes('undefined') && !original.includes('\n')
  ) {
    return original;
  }

  return FRIENDLY[CATEGORIES.UNKNOWN];
}

export function handleError(err, context = {}) {
  const category  = categorize(err);
  const friendly  = friendlyMessage(category, err);

  const entry = {
    ts:        new Date().toISOString(),
    category,
    message:   err?.message || String(err),
    friendly,
    context,
    stack:     err?.stack,
  };

  if (_logs.length >= MAX_LOGS) _logs.shift();
  _logs.push(entry);

  if (_devMode) {
    console.group(`%c[Erro][${category}]`, 'color:#ef4444;font-weight:bold');
    console.error(err);
    console.log('contexto:', context);
    console.log('mensagem amigável:', friendly);
    console.groupEnd();
  }

  if (category !== CATEGORIES.UI) {
    track(EVENTS.ERROR, { category, message: entry.message, ctx: context.context });
  }

  const shouldToast = context.showToast === true ||
    (context.silent !== true && category !== CATEGORIES.AUTH);

  if (shouldToast) {
    showToast(friendly, 'error');
  }

  return { category, friendly };
}
