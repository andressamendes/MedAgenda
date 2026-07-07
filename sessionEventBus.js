// ── sessionEventBus.js — Barramento de Eventos da Sessão de Estudo (F6.2) ───
//
// Pub/sub em memória, JavaScript puro — sem EventEmitter, sem RxJS, sem
// dependências externas. Mesmo padrão mínimo já usado por
// activitySessionService.onSessionFinished() (F1.3) e
// reviewService.onReviewStatusChanged() (F2.3), generalizado aqui para os
// seis eventos de domínio definidos na F6.1.
//
// activitySessionService.js é o único publicador (ver F6.1, Etapa 4/9): ele
// nunca importa nem conhece nenhum consumidor. Consumidores conhecem o
// barramento; o barramento nunca conhece consumidores específicos.
//
// Nenhum estado é persistido aqui — só o registro de assinantes em memória
// (perdido a cada reload, como o pub/sub anterior já era).

/** Os seis eventos oficiais do domínio da Sessão de Estudo — nenhum outro é publicado. */
export const SESSION_EVENTS = Object.freeze({
  STARTED:   "SessionStarted",
  PAUSED:    "SessionPaused",
  RESUMED:   "SessionResumed",
  FINISHED:  "SessionFinished",
  CANCELLED: "SessionCancelled",
  UPDATED:   "SessionUpdated",
});

const _listeners = new Map(); // eventType -> Set<callback>

function _listenersFor(eventType) {
  let set = _listeners.get(eventType);
  if (!set) {
    set = new Set();
    _listeners.set(eventType, set);
  }
  return set;
}

/**
 * Assina um dos eventos de SESSION_EVENTS. `callback` recebe o payload
 * { session, timestamp, eventType } — ver publish(). Retorna uma função que
 * cancela a assinatura (mesmo contrato de onSessionFinished/onReviewStatusChanged).
 */
export function subscribe(eventType, callback) {
  _listenersFor(eventType).add(callback);
  return () => unsubscribe(eventType, callback);
}

/** Cancela uma assinatura. Idempotente — chamar duas vezes não é erro. */
export function unsubscribe(eventType, callback) {
  _listeners.get(eventType)?.delete(callback);
}

/**
 * Publica `session` para todos os assinantes atuais de `eventType`, na ordem
 * em que se inscreveram. O payload é sempre { session, timestamp, eventType }
 * — nunca dado derivado (nada de estatística, contagem ou resumo calculado
 * aqui: isso é responsabilidade de quem consome, não do barramento).
 *
 * Publicar um evento sem nenhum assinante é um no-op silencioso — o
 * publicador nunca precisa saber se alguém está ouvindo.
 *
 * Um assinante que lança não impede os demais nem quem publicou (mesma
 * postura defensiva de activitySessionService._notifySessionFinished()).
 */
export function publish(eventType, session) {
  const set = _listeners.get(eventType);
  if (!set || set.size === 0) return;

  const payload = { session, timestamp: new Date().toISOString(), eventType };
  for (const callback of [...set]) {
    try {
      callback(payload);
    } catch (err) {
      console.error(`sessionEventBus: listener de ${eventType} falhou:`, err);
    }
  }
}

/** Remove todas as assinaturas de todos os eventos. Uso: logout / reset entre testes. */
export function clear() {
  _listeners.clear();
}
