import { showToast } from './toastService.js';
import { track, EVENTS } from './telemetryService.js';

const CATEGORIES = {
  AUTH:     'auth',
  NETWORK:  'network',
  DATABASE: 'database',
  AI:       'ai',
  STORAGE:  'storage',
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
  // AIError (services/ai/providers/geminiProvider.js) já vem com um código
  // próprio (AUTH/NETWORK/TIMEOUT/RATE_LIMIT/UNAVAILABLE/API_ERROR/EMPTY_RESPONSE)
  // e mensagem específica por caso — classificar por nome evita que o texto
  // (ex.: "temporariamente indisponível") caia num balde genérico por acidente.
  if (err?.name === 'AIError') return CATEGORIES.AI;

  // F4.2 (causa raiz): todo erro lançado pelo auth-js do Supabase (GoTrueClient)
  // — token de acesso expirado, refresh token inválido/ausente/já usado, sessão
  // ausente, JWT malformado, etc. — carrega a flag interna `__isAuthError`,
  // independentemente da subclasse (AuthApiError, AuthSessionMissingError,
  // AuthRetryableFetchError...) e do texto/idioma da mensagem. Depender apenas
  // de substrings em inglês na mensagem (abaixo) não cobre mensagens reais como
  // "Auth session missing!" ou "Invalid Refresh Token: Refresh Token Not Found"
  // — exatamente o cenário de sessão expirada por inatividade, que por isso
  // caía em UNKNOWN/DATABASE e virava "Erro ao comunicar com o servidor" em vez
  // de "Sessão expirada" (Revisões, e às vezes Dashboard/Insights, dependendo
  // de qual chamada tocasse esse formato de erro).
  if (err?.__isAuthError === true) return CATEGORIES.AUTH;

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
    msg.includes('bucket') || msg.includes('storage/object') ||
    msg.includes('storage api')
  ) return CATEGORIES.STORAGE;

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
  [CATEGORIES.STORAGE]: 'Serviço de armazenamento indisponível. Tente novamente mais tarde.',
  [CATEGORIES.PUSH]:  'Erro ao configurar notificações. Verifique as permissões do navegador.',
  [CATEGORIES.SW]:    'Erro no serviço em segundo plano. Recarregue a página.',
  [CATEGORIES.UNKNOWN]:'Algo deu errado. Tente novamente.',
};

function friendlyMessage(category, err) {
  const msg = String(err?.message || '').toLowerCase();

  if (category === CATEGORIES.AUTH) {
    // F4.2 (causa raiz): checar só "invalid" era amplo demais — "Invalid
    // Refresh Token: Refresh Token Not Found" (sessão morta, ver
    // supabase.currentUserId()) também contém "invalid" e virava, por
    // engano, "E-mail ou senha incorretos." — a mesma mensagem de uma tentativa
    // de login malsucedida. Restrito ao texto que realmente indica
    // credenciais de login erradas (o mesmo critério que categorize() já usa
    // para decidir isto), nunca a qualquer variação de token/sessão inválidos.
    if (msg.includes('invalid login') || msg.includes('invalid_credentials') || msg.includes('invalid login credentials')) {
      return FRIENDLY.auth.invalid;
    }
    if (msg.includes('confirmed')) return FRIENDLY.auth.unconfirmed;
    return FRIENDLY.auth.default;
  }

  if (category === CATEGORIES.DATABASE) {
    if (msg.includes('23505') || msg.includes('duplicate')) return FRIENDLY.database.duplicate;
    return FRIENDLY.database.default;
  }

  // AIError já traz uma mensagem específica por código (rate limit, timeout,
  // indisponibilidade, etc. — ver geminiProvider.js) — preservá-la em vez de
  // reduzir para um texto genérico único.
  if (category === CATEGORIES.AI) {
    return err?.message || 'Ocorreu um erro ao contatar o assistente de IA. Verifique sua conexão e tente novamente.';
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
    code:      err?.code ?? null,
    status:    err?.status ?? err?.statusCode ?? null,
    message:   err?.message || String(err),
    friendly,
    context,
    // Metadados de diagnóstico de Storage (ver avatarService.js), nunca
    // exibidos ao usuário — apenas para consulta em getRecentErrors().
    storageOp:     err?.storageOp ?? null,
    storageBucket: err?.storageBucket ?? null,
    storagePath:   err?.storagePath ?? null,
    stack:     err?.stack,
  };

  if (_logs.length >= MAX_LOGS) _logs.shift();
  _logs.push(entry);

  if (_devMode) {
    console.group(`%c[Erro][${category}]`, 'color:#ef4444;font-weight:bold');
    console.error(err);
    console.log('contexto:', context);
    console.log('mensagem amigável:', friendly);
    if (entry.storageOp) {
      console.log('storage:', {
        op: entry.storageOp, bucket: entry.storageBucket,
        path: entry.storagePath, status: entry.status, code: entry.code,
      });
    }
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

/**
 * Retorna os últimos erros registrados (mais recente primeiro), sem o stack
 * trace, para uso em diagnóstico/suporte (ver diagnosticService.js). O
 * buffer em si (`_logs`) já existia, mas não era consultável de fora deste
 * módulo — nada mudou na forma como os erros são coletados.
 */
export function getRecentErrors(limit = 20) {
  return _logs.slice(-limit).reverse().map(({ stack, ...rest }) => rest);
}
