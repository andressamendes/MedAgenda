import { showToast } from './toastService.js';
import { track, EVENTS } from './telemetryService.js';

const CATEGORIES = {
  AUTH:       'auth',
  NETWORK:    'network',
  DATABASE:   'database',
  AI:         'ai',
  STORAGE:    'storage',
  PUSH:       'push',
  SW:         'service_worker',
  UI:         'ui',
  RATE_LIMIT: 'rate_limit',
  UNKNOWN:    'unknown',
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

  // Rate limiting do Supabase (auth-js e demais APIs) chega com status 429 e/
  // ou um `code` dedicado (ex.: over_email_send_rate_limit,
  // over_request_rate_limit), mesmo quando também carrega `__isAuthError` —
  // por isso este check roda antes dele, para não virar uma mensagem de
  // "sessão expirada" quando na verdade é só "aguarde e tente de novo".
  const rlMsg  = String(err?.message || err).toLowerCase();
  const rlCode = String(err?.code || '');
  if (
    err?.status === 429 || rlCode === 'over_email_send_rate_limit' ||
    rlCode === 'over_request_rate_limit' ||
    rlMsg.includes('rate limit') || rlMsg.includes('security purposes')
  ) return CATEGORIES.RATE_LIMIT;

  // F4.2/A1.2 (contrato estruturado): qualquer erro de autenticação — do
  // auth-js do Supabase (AuthApiError, AuthSessionMissingError,
  // AuthRetryableFetchError... independentemente da subclasse ou do
  // texto/idioma da mensagem) ou gerado por este app (AuthError, ver
  // authError.js) — carrega a flag `__isAuthError: true`. Este é o único
  // sinal usado para classificar como 'auth': nenhuma substring de mensagem
  // entra nessa decisão.
  if (err?.__isAuthError === true) return CATEGORIES.AUTH;

  const msg = String(err?.message || err).toLowerCase();
  const code = String(err?.code || '');

  // PGRST301: o PostgREST recusa a consulta por JWT expirado/inválido — não
  // passa pelo auth-js (não carrega `__isAuthError`), mas o `code` numérico
  // devolvido já identifica a causa de forma estruturada, sem precisar
  // inspecionar a mensagem.
  if (code === 'PGRST301') return CATEGORIES.AUTH;

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
    duplicate:    'Este e-mail já está cadastrado. Faça login.',
    // A1.4 — link de recuperação de senha inválido/expirado/reutilizado
    // (ver authError.js AUTH_REASONS.LINK_EXPIRED/LINK_INVALID). Nunca reusar
    // a mensagem de "sessão expirada": aqui o problema é o link de e-mail,
    // não uma sessão que já existia, e a ação correta é pedir um novo link,
    // nunca "entrar novamente".
    linkExpired:  'Este link de redefinição de senha não é mais válido. Ele pode ter expirado ou já ter sido utilizado. Solicite um novo link para continuar.',
    linkInvalid:  'Este link de redefinição de senha é inválido. Solicite um novo link para continuar.',
    // A1.5 — reautenticação obrigatória para alterar a senha (ver
    // auth.js#reauthenticate). Mensagem própria, nunca a de login
    // ("E-mail ou senha incorretos"): esta tela só tem um campo de senha.
    currentPasswordIncorrect: 'Senha atual incorreta. Verifique e tente novamente.',
  },
  [CATEGORIES.NETWORK]:  'Sem conexão com a internet. Verifique sua rede e tente novamente.',
  [CATEGORIES.DATABASE]: {
    default:  'Erro ao comunicar com o servidor. Tente novamente em instantes.',
    duplicate:'Já existe um registro com essas informações.',
  },
  [CATEGORIES.STORAGE]:    'Serviço de armazenamento indisponível. Tente novamente mais tarde.',
  [CATEGORIES.PUSH]:      'Erro ao configurar notificações. Verifique as permissões do navegador.',
  [CATEGORIES.SW]:        'Erro no serviço em segundo plano. Recarregue a página.',
  [CATEGORIES.RATE_LIMIT]:'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.',
  [CATEGORIES.UNKNOWN]:   'Algo deu errado. Tente novamente.',
};

/**
 * `fallbackMessage` (opcional, vindo de handleError) é texto puro, nunca
 * lógica de classificação — cada tela pode indicar qual frase genérica faz
 * mais sentido no seu contexto ("não foi possível fazer login" vs. "não foi
 * possível enviar o link", etc.) para os casos em que a categoria não chega
 * a um sub-caso específico (invalid/unconfirmed/duplicate...). A
 * classificação em si (qual categoria, qual sub-caso) continua inteiramente
 * decidida aqui, nunca na view.
 */
function friendlyMessage(category, err, fallbackMessage) {
  const msg = String(err?.message || '').toLowerCase();

  if (category === CATEGORIES.AUTH) {
    // A1.2 (contrato estruturado): o `code` dedicado do auth-js (ex.:
    // 'invalid_credentials', 'user_already_exists', 'email_not_confirmed') é
    // o sinal preferido quando presente — mas nem toda versão/caminho do SDK
    // garante esse campo, então a mensagem continua como sinal de apoio para
    // não regredir os sub-casos de login/cadastro (fora do escopo desta
    // etapa, que trata apenas da classificação de categoria em categorize(),
    // nunca decidida por mensagem desde F4.2/A1.2).
    const code = String(err?.code || '');
    if (code === 'invalid_credentials') return FRIENDLY.auth.invalid;
    if (code === 'user_already_exists') return FRIENDLY.auth.duplicate;
    if (code === 'email_not_confirmed') return FRIENDLY.auth.unconfirmed;
    // A1.4 — códigos próprios (não do Supabase), atribuídos por authView.js ao
    // construir o AuthError a partir dos parâmetros de erro lidos na URL do
    // link de e-mail (ver auth.js#parseAuthRedirectError).
    if (code === 'recovery_link_expired') return FRIENDLY.auth.linkExpired;
    if (code === 'recovery_link_invalid') return FRIENDLY.auth.linkInvalid;
    if (code === 'current_password_incorrect') return FRIENDLY.auth.currentPasswordIncorrect;

    // F4.2 (causa raiz): checar só "invalid" era amplo demais — "Invalid
    // Refresh Token: Refresh Token Not Found" (sessão morta, ver
    // supabase.currentUserId()) também contém "invalid" e virava, por
    // engano, "E-mail ou senha incorretos." — a mesma mensagem de uma tentativa
    // de login malsucedida. Restrito ao texto que realmente indica
    // credenciais de login erradas, nunca a qualquer variação de token/sessão
    // inválidos.
    if (msg.includes('invalid login') || msg.includes('invalid_credentials') || msg.includes('invalid login credentials')) {
      return FRIENDLY.auth.invalid;
    }
    if (msg.includes('already registered') || msg.includes('already exists')) {
      return FRIENDLY.auth.duplicate;
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
  if (typeof mapped === 'string') {
    // UNKNOWN is the true catch-all: let the caller supply a
    // context-appropriate generic phrase instead of the app-wide default.
    if (category === CATEGORIES.UNKNOWN && fallbackMessage) return fallbackMessage;
    return mapped;
  }

  if (fallbackMessage) return fallbackMessage;

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
  const friendly  = friendlyMessage(category, err, context.fallbackMessage);

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
