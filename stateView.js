// ── stateView.js — Fluxo único de estados de carregamento (F4.1) ────────────
//
// Toda tela que busca dados (lista de compromissos, calendário, agenda
// semanal, Central de Insights, Dashboard de Execução, categorias,
// calendário acadêmico, histórico de sessões) usa exatamente este
// componente para decidir o que exibir quando a busca falha. Nenhuma tela
// decide mensagem, ícone ou ação por conta própria — cada uma só chama
// errorToState(handleError(err, {...})) e passa o resultado para
// renderStateBlock() (ou para a variante em string, stateBlockMarkup()/
// wireStateBlock(), quando o bloco de erro precisa nascer dentro de um
// template maior já existente).
//
// A classificação do erro em si (rede/autenticação/banco/etc.) continua
// vindo inteiramente de errorService.categorize() via handleError() — cada
// tela chama handleError() como já fazia e só repassa o resultado
// ({ category, friendly }) para errorToState(), que traduz a categoria já
// decidida lá para um dos estados de UI abaixo. Nenhuma lógica de
// classificação é duplicada, e este módulo nunca importa errorService.js
// diretamente (evita reclassificar e mantém stateView.js — um módulo
// carregado uma única vez e reutilizado por muitas telas — livre de
// qualquer dependência que precise variar entre chamadas).
//
// "Sessão expirada" nunca oferece "Tentar novamente": repetir a mesma busca
// com uma sessão morta só repete o mesmo erro. A única ação válida é
// reautenticar, através do fluxo de autenticação oficial já existente em
// authView.js — este módulo não conhece authView.js diretamente (evita um
// ciclo de import, já que várias views que usam stateView.js também são
// usadas a partir de authView.js); quem conhece o fluxo oficial registra o
// handler uma única vez, no bootstrap, via setReauthHandler().

import { escapeHtml } from "./utils.js";
import { iconLock, iconWifiOff, iconAlertTriangle, iconDatabase } from "./icons.js";

export const STATES = {
  SESSION_EXPIRED: "session_expired",
  NETWORK:         "network",
  SERVER:          "server",
  // P0 — Proteção contra Divergência de Schema. Estado dedicado: nunca
  // reaproveita SERVER (que oferece "Tentar novamente" — repetir a mesma
  // consulta contra um schema desatualizado só repete o mesmo erro; a única
  // ação real é recarregar depois que o administrador aplicar as migrations
  // pendentes, ou contatá-lo).
  SCHEMA_MISMATCH: "schema_mismatch",
};

// icon/título/descrição/ação — ETAPA 3: cada estado tem exatamente estes
// quatro elementos, sempre os mesmos, em qualquer tela.
const STATE_DEFS = {
  [STATES.SESSION_EXPIRED]: {
    icon:        iconLock,
    title:       "Sessão expirada",
    actionLabel: "Entrar novamente",
    retryable:   false,
  },
  [STATES.NETWORK]: {
    icon:        iconWifiOff,
    title:       "Sem conexão",
    actionLabel: "Tentar novamente",
    retryable:   true,
  },
  [STATES.SERVER]: {
    icon:        iconAlertTriangle,
    title:       "Erro ao comunicar com o servidor",
    actionLabel: "Tentar novamente",
    retryable:   true,
  },
  [STATES.SCHEMA_MISMATCH]: {
    icon:        iconDatabase,
    title:       "Banco de dados desatualizado",
    actionLabel: "Recarregar",
    retryable:   false,
  },
};

// errorService.categorize() já resolve exatamente qual categoria um erro
// pertence (auth/network/database/ai/storage/push/service_worker/unknown) —
// aqui só agrupamos essas categorias nos três estados acionáveis da UI:
// problema de sessão exige reautenticação, os demais casos (rede ou
// qualquer outra falha do lado do servidor/infra) exigem apenas nova
// tentativa.
export function categoryToState(category) {
  if (category === "auth")            return STATES.SESSION_EXPIRED;
  if (category === "network")         return STATES.NETWORK;
  if (category === "schema_mismatch") return STATES.SCHEMA_MISMATCH;
  return STATES.SERVER;
}

/**
 * Traduz o resultado de errorService.handleError() — { category, friendly }
 * — no estado de UI único usado por todas as telas de listagem/leitura.
 * Cada tela continua chamando handleError() ela mesma (para telemetria, com
 * `silent: true`) e só repassa o retorno para cá.
 */
export function errorToState({ category, friendly }) {
  return { state: categoryToState(category), message: friendly };
}

// Handler do fluxo oficial de reautenticação — configurado uma única vez no
// bootstrap (ver script.js) com authView.forceReauth(). Sem handler
// registrado, o pior caso é um reload da página: getSession() roda de novo
// no próximo carregamento e leva o usuário à tela de login sozinho — nunca
// uma tela de erro sem saída.
let _reauthHandler = () => { window.location.reload(); };

export function setReauthHandler(fn) {
  _reauthHandler = fn;
}

// Aciona diretamente o fluxo oficial de reautenticação — para telas que não
// usam renderStateBlock()/stateBlockMarkup() (ex.: aiPanelView.js, cujo botão
// de ação já existe fixo no DOM), mas ainda assim precisam garantir que
// "sessão expirada" nunca ofereça um simples retry (ETAPA 5).
export function triggerReauth() {
  _reauthHandler();
}

function _runAction(state, onRetry) {
  if (state === STATES.SESSION_EXPIRED) _reauthHandler();
  else onRetry?.();
}

/**
 * Renderiza o bloco de estado dentro de `container`, substituindo todo o
 * conteúdo existente. Usado pelas telas que já têm um elemento dedicado ao
 * estado de erro (ex.: dash-error, insights-*-error, list-empty).
 */
export function renderStateBlock(container, { state, message, onRetry } = {}) {
  const def = STATE_DEFS[state];
  container.innerHTML = "";
  container.classList.add("state-block", `state-block--${state}`);

  const icon = document.createElement("span");
  icon.className = "state-block-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = def.icon;

  const title = document.createElement("strong");
  title.className = "state-block-title";
  title.textContent = def.title;

  const desc = document.createElement("span");
  desc.className = "state-block-desc";
  desc.textContent = message || "";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-sm btn-ghost list-error-retry state-block-action";
  btn.textContent = def.actionLabel;
  btn.addEventListener("click", () => _runAction(state, onRetry));

  container.append(icon, title, desc, btn);
}

/**
 * Variante em string do mesmo bloco, para telas que montam um template maior
 * de uma vez só (ex.: categoryView.js, academicCalendarView.js,
 * academicCalendarEventsView.js) e só depois inserem no DOM. Sempre usada
 * junto de wireStateBlock() logo após a inserção — mesmo ícone/título/
 * descrição/ação de renderStateBlock(), nunca uma variação própria da tela.
 */
export function stateBlockMarkup({ state, message }) {
  const def = STATE_DEFS[state];
  return `
    <p class="state-block state-block--${state}">
      <span class="state-block-icon" aria-hidden="true">${def.icon}</span>
      <strong class="state-block-title">${def.title}</strong>
      <span class="state-block-desc">${escapeHtml(message || "")}</span>
      <button type="button" class="btn btn-sm btn-ghost list-error-retry state-block-action" data-state="${state}">${def.actionLabel}</button>
    </p>`;
}

// Liga o botão de ação de um bloco produzido por stateBlockMarkup(). `root`
// é qualquer ancestral já presente no DOM no momento da chamada.
export function wireStateBlock(root, onRetry) {
  const btn = root.querySelector(".state-block-action");
  if (!btn) return;
  btn.addEventListener("click", () => _runAction(btn.dataset.state, onRetry));
}

// Remove as classes deixadas por renderStateBlock() quando a tela volta a
// exibir conteúdo normal (dados carregados ou "sem dados") — evita que o
// layout de bloco de estado (ícone + título + descrição centralizados)
// vaze para um texto simples de "sem dados".
export function clearStateBlock(container) {
  container.classList.remove(
    "state-block",
    ...Object.values(STATES).map(s => `state-block--${s}`)
  );
}
