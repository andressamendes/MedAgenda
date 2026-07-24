// ── activeSessionIndicatorView.js — Mini-timer flutuante da sessão ativa
// (V5.11, evolução do chip de header F11 E13) ────────────────────────────
//
// Auditoria #10: sem nenhum indicador global, uma sessão de estudo em
// andamento fica invisível assim que o usuário sai da página "Sessão" (F7.2,
// único lugar com o cronômetro completo) — sessões esquecidas, confiança
// perdida nos dados de estudo. F11 E13 resolveu isso com um chip no header;
// V5.11 evolui esse chip para um elemento fixo na tela (sobrevive a
// qualquer rolagem, em vez de só existir dentro da faixa do header) que se
// expande com um toque para tempo + "+1 questão" — uma ação rápida, sem
// abrir a página de Sessão. Continua sem duplicar nenhum controle de
// pausar/retomar/finalizar/formulário detalhado, exclusivos de
// studySessionView.js; por isso fica oculto enquanto #page-study-session
// está ativa (lá os controles completos já existem).
//
// Atualiza por minuto (não por segundo): o mini-timer só precisa comunicar
// "ainda rodando, há quanto tempo" — não ser um cronômetro de precisão.

import { getActiveSession } from "./activitySessionService.js";
import { addQuestion } from "./sessionQuestionsService.js";
import { handleError } from "./errorService.js";
import { toast } from "./toastService.js";
import { formatDuration } from "./utils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";
import { showPage } from "./navigationView.js";

const TICK_MS = 60_000;

let chipEl = null;
let toggleEl = null;
let timeEl = null;
let panelEl = null;
let openBtnEl = null;
let quickBtnEl = null;
let studyPageEl = null;
let _pageObserver = null;
let _session = null;
let _expanded = false;
let _quickBusy = false;
let _tickTimer = null;
let _unsubscribers = [];

// Mesma fórmula de studySessionView.js/_minutesBetween() — não é uma regra
// nova, só a mesma leitura de started_at/paused_ms/paused_at usada lá.
function _minutesElapsed(session, now = new Date()) {
  const currentPauseMs = session.status === "paused" && session.paused_at
    ? Math.max(0, now - new Date(session.paused_at))
    : 0;
  const totalPausedMs = (session.paused_ms || 0) + currentPauseMs;
  return Math.max(0, Math.floor((now - new Date(session.started_at) - totalPausedMs) / 60000));
}

function _stopTicking() {
  if (_tickTimer) {
    clearInterval(_tickTimer);
    _tickTimer = null;
  }
}

function _startTicking() {
  if (_tickTimer) return;
  _tickTimer = setInterval(_render, TICK_MS);
  // Só existe em Node (testes) — no browser é sempre undefined/no-op. Sem
  // isso, um timer de 60s pendente mantém o processo de teste vivo até
  // expirar, mesmo depois de todos os testes já terem terminado.
  _tickTimer.unref?.();
}

function _setExpanded(expanded) {
  _expanded = expanded && !!_session;
  if (!toggleEl || !panelEl) return;
  toggleEl.setAttribute("aria-expanded", String(_expanded));
  panelEl.hidden = !_expanded;
}

// A página de Sessão (studySessionView.js) já mostra o cronômetro completo
// com todos os controles — o mini-timer visível por cima ali seria uma
// segunda fonte da mesma informação, exatamente o que este widget existe
// para evitar (ver critério de aceite). Mesmo padrão de leitura direta do
// DOM já usado em outros pontos do app (ex.: tests/keyboardService.test.js)
// em vez de um evento novo de troca de página.
function _onStudySessionPage() {
  if (!studyPageEl) studyPageEl = document.getElementById("page-study-session");
  return !!studyPageEl && !studyPageEl.hidden;
}

function _render() {
  if (!chipEl) return;
  if (!_session || _onStudySessionPage()) {
    chipEl.hidden = true;
    _setExpanded(false);
    _stopTicking();
    return;
  }
  chipEl.hidden = false;
  const paused = _session.status === "paused";
  timeEl.textContent = `${formatDuration(_minutesElapsed(_session))}${paused ? " · Pausada" : ""}`;
  _startTicking();
}

function _handleBusEvent({ session, eventType }) {
  const ended = eventType === SESSION_EVENTS.FINISHED || eventType === SESSION_EVENTS.CANCELLED;
  _session = ended ? null : session;
  if (ended) _setExpanded(false);
  _render();
}

// F17 — mesmo default de "1 questão, 0 erros" usado pelo registro rápido de
// studySessionView.js/_quickAddQuestion(): múltipla escolha, média, já
// respondida. O único ponto de escrita continua sendo
// sessionQuestionsService.addQuestion() — nenhum CRUD de Questões é
// duplicado aqui.
async function _quickAddQuestion() {
  if (_quickBusy || !_session) return;
  _quickBusy = true;
  quickBtnEl.disabled = true;
  try {
    await addQuestion(_session.id, {
      question_type: "multiple_choice",
      status:        "answered",
      difficulty:    "medium",
      subject:       null,
      topic:         null,
      correct_count:   1,
      incorrect_count: 0,
    });
  } catch (err) {
    handleError(err, { context: "activeSessionIndicatorView.quickAddQuestion" });
    return;
  } finally {
    _quickBusy = false;
    quickBtnEl.disabled = false;
  }
  toast.info("Questão registrada.", 2000);
  // A lista de studySessionView.js só recarrega quando a identidade da
  // sessão muda (ver _syncSessionQuestionsAndReviews/_sessionDataLoadedFor)
  // — sem este empurrão, uma questão registrada por aqui ficaria fora da
  // lista até a sessão terminar e uma nova começar. Import dinâmico: este
  // módulo não precisa da árvore de dependências inteira de
  // studySessionView.js só para o caminho comum (nenhuma sessão ativa).
  import("./studySessionView.js")
    .then(({ refreshSessionQuestions }) => refreshSessionQuestions())
    .catch((err) => handleError(err, { context: "activeSessionIndicatorView.refreshSessionQuestions", silent: true }));
}

/**
 * Monta o mini-timer (uma única vez) e restaura, se existir, a sessão em
 * andamento ou pausada do usuário atual — mesma consulta de recuperação já
 * usada por studySessionView.js/F7.8, aqui repetida de forma independente
 * (nenhum acoplamento entre os dois módulos: cada view se inicializa a
 * partir dos serviços, nunca de estado interno de outra view). Assina o
 * barramento de eventos (F6.2) para manter o widget sincronizado sem
 * polling.
 */
export async function initActiveSessionIndicator() {
  if (!chipEl) {
    chipEl     = document.getElementById("active-session-chip");
    toggleEl   = document.getElementById("active-session-chip-toggle");
    timeEl     = document.getElementById("active-session-chip-time");
    panelEl    = document.getElementById("active-session-chip-panel");
    openBtnEl  = document.getElementById("active-session-chip-open");
    quickBtnEl = document.getElementById("active-session-chip-quick");

    toggleEl?.addEventListener("click", () => _setExpanded(!_expanded));
    openBtnEl?.addEventListener("click", () => {
      _setExpanded(false);
      showPage("study-session");
    });
    quickBtnEl?.addEventListener("click", () => _quickAddQuestion());

    // navigationView.js/showPage() só alterna o atributo `hidden` de cada
    // #page-*, sem publicar nenhum evento — observar diretamente esse
    // atributo (em vez de escutar cliques de navegação, que viriam de vários
    // pontos: sidebar, bottom nav, paleta de comandos, atalhos de teclado)
    // é o jeito de saber "o usuário entrou/saiu da página de Sessão" sem
    // acoplar este módulo a todos eles.
    studyPageEl = document.getElementById("page-study-session");
    if (studyPageEl && window.MutationObserver) {
      _pageObserver = new window.MutationObserver(_render);
      _pageObserver.observe(studyPageEl, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  if (_unsubscribers.length === 0) {
    _unsubscribers = [
      subscribe(SESSION_EVENTS.STARTED,   _handleBusEvent),
      subscribe(SESSION_EVENTS.PAUSED,    _handleBusEvent),
      subscribe(SESSION_EVENTS.RESUMED,   _handleBusEvent),
      subscribe(SESSION_EVENTS.FINISHED,  _handleBusEvent),
      subscribe(SESSION_EVENTS.CANCELLED, _handleBusEvent),
      subscribe(SESSION_EVENTS.UPDATED,   _handleBusEvent),
    ];
  }

  try {
    _session = await getActiveSession();
  } catch (err) {
    handleError(err, { context: "activeSessionIndicatorView.restore", silent: true });
    _session = null;
  }
  _render();
}

/**
 * Desfaz as assinaturas e o intervalo de atualização, e esconde o
 * mini-timer. Chamada no logout/troca de usuário (ver
 * script.js/onBeforeSignOut) — sem isso, o widget do usuário anterior (e o
 * timer rodando) sobreviveria à troca de sessão.
 */
export function resetActiveSessionIndicator() {
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  // O observer de #page-study-session (ver initActiveSessionIndicator) não é
  // desfeito aqui, de propósito: assim como os listeners de clique do
  // widget, ele vive presos ao mesmo botão que sobrevive a um logout/login
  // (SPA, DOM nunca recriado) — reconectá-lo exigiria desfazer o guard
  // `if (!chipEl)` de initActiveSessionIndicator(), e sem sessão ativa ele
  // já é um no-op inofensivo (_render() só teria _session === null).
  _stopTicking();
  _session = null;
  _setExpanded(false);
  if (chipEl) chipEl.hidden = true;
}
