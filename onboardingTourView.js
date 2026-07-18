// onboardingTourView.js — tour de boas-vindas leve e opcional (F10 #5.4).
//
// Nunca um modal obrigatório: um cartão dispensável no topo da Agenda, no
// mesmo espírito do estado vazio didático de weekView.js (F10 #1.6) — mesmas
// classes .state-block/.state-block-*, mesmo padrão de dispensa via
// localStorage (nunca reaparece depois de fechado, falha segura se o storage
// não estiver disponível). Mostrado uma única vez, só para quem nunca teve
// nenhuma sessão de estudo (hasAnySession() em activitySessionService.js) —
// um usuário já ativo nunca vê o tour, mesmo que o localStorage tenha sido
// limpo.
import { hasAnySession } from "./activitySessionService.js";
import { revealWithAnimation } from "./transitionUtils.js";
import { handleError } from "./errorService.js";
import { iconSparkle } from "./icons.js";
import { showPage } from "./navigationView.js";

const TOUR_SEEN_KEY = "medagenda_tour_seen";

const STEPS = [
  { page: "agenda",       label: "Agenda",  desc: "Crie compromissos de estudo clicando em um horário livre." },
  { page: "study-session", label: "Sessão",  desc: "Inicie uma sessão avulsa e registre questões e revisões enquanto estuda." },
  { page: "journal",      label: "Diário",   desc: "Revise suas sessões concluídas e acompanhe sua sequência de estudos." },
  { page: "dashboard",    label: "Dashboard", desc: "Acompanhe seu progresso e suas conquistas." },
];

let cardEl = null;
let _bound = false;

function _hasSeenTour() {
  try { return localStorage.getItem(TOUR_SEEN_KEY) === "1"; } catch { return true; }
}

function _markTourSeen() {
  try { localStorage.setItem(TOUR_SEEN_KEY, "1"); } catch { /* storage indisponível */ }
}

function _dismiss() {
  _markTourSeen();
  if (cardEl) cardEl.hidden = true;
}

function _renderCard() {
  cardEl.innerHTML = `
    <span class="state-block-icon" aria-hidden="true">${iconSparkle}</span>
    <strong class="state-block-title">Bem-vindo(a) ao Anoti</strong>
    <span class="state-block-desc">Um resumo rápido do que você pode fazer por aqui:</span>
    <ol class="onboarding-tour-steps">
      ${STEPS.map((step, i) => `
        <li>
          <button type="button" class="onboarding-tour-step" data-page="${step.page}">
            <span class="onboarding-tour-step-num">${i + 1}</span>
            <span class="onboarding-tour-step-text"><strong>${step.label}</strong> — ${step.desc}</span>
          </button>
        </li>
      `).join("")}
    </ol>
    <button type="button" class="btn btn-sm btn-ghost state-block-action" id="onboarding-tour-dismiss">Entendi, vamos começar</button>
  `;
  cardEl.querySelectorAll(".onboarding-tour-step").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });
  cardEl.querySelector("#onboarding-tour-dismiss").addEventListener("click", _dismiss);
}

export async function initOnboardingTour() {
  if (!_bound) {
    cardEl = document.getElementById("onboarding-tour-card");
    _bound = true;
  }
  if (!cardEl || _hasSeenTour()) return;

  let alreadyActive;
  try {
    alreadyActive = await hasAnySession();
  } catch (err) {
    // Rede de segurança: falha na checagem nunca deve mostrar o tour por
    // engano (ex.: um usuário experiente vendo boas-vindas de novo por causa
    // de um erro de rede transitório) — melhor não mostrar do que mostrar
    // errado.
    handleError(err, { context: "onboardingTourView.check", silent: true });
    return;
  }
  if (alreadyActive) {
    _markTourSeen();
    return;
  }

  _renderCard();
  cardEl.hidden = false;
  revealWithAnimation(cardEl);
}

// Chamada no logout/troca de usuário (mesma simetria init/reset dos demais
// subsistemas — auditoria A1.3): o cartão de um usuário nunca deve sobreviver
// à troca de sessão nesta SPA sem reload de página.
export function resetOnboardingTourView() {
  if (cardEl) {
    cardEl.hidden = true;
    cardEl.innerHTML = "";
  }
}
