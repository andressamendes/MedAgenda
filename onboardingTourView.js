// onboardingTourView.js — tour de boas-vindas leve e opcional (F10 #5.4, V5.9).
//
// Nunca um modal obrigatório: um cartão dispensável no topo da Agenda, no
// mesmo espírito do estado vazio didático de weekView.js (F10 #1.6) — mesmas
// classes .state-block/.state-block-*, mesmo padrão de dispensa via
// localStorage (nunca reaparece depois de fechado, falha segura se o storage
// não estiver disponível). Mostrado uma única vez, só para quem nunca teve
// nenhuma sessão de estudo (hasAnySession() em activitySessionService.js) —
// um usuário já ativo nunca vê o tour, mesmo que o localStorage tenha sido
// limpo.
//
// V5.9: a lista numerada de 4 telas (uma por página do app) foi trocada por
// 2-3 telas curtas de propósito emocional — o "porquê" do Anoti (a curva do
// esquecimento, progresso visível) antes de qualquer lista de funções. A
// última tela ainda oferece uma ação concreta (ir para a Agenda), mas o tour
// em si não ensina mais "o que cada tela faz" — isso o usuário descobre
// explorando.
import { hasAnySession } from "./activitySessionService.js";
import { revealWithAnimation } from "./transitionUtils.js";
import { handleError } from "./errorService.js";
import { iconSparkle, iconRepeat, iconFlame } from "./icons.js";
import { showPage } from "./navigationView.js";

const TOUR_SEEN_KEY = "medagenda_tour_seen";

const SLIDES = [
  {
    icon: iconSparkle,
    title: "Bem-vindo(a) ao Anoti",
    desc: "Medicina não se aprende numa noite — se aprende em constância. O Anoti existe para te ajudar a manter essa constância, sem peso.",
  },
  {
    icon: iconRepeat,
    title: "Contra o esquecimento",
    desc: "O que você estuda hoje some em semanas sem revisão. Cada sessão que você registra aqui vira memória de longo prazo, não só uma tarde de estudo.",
  },
  {
    icon: iconFlame,
    title: "Seu progresso, visível",
    desc: "Sua sequência de estudos e o que já foi revisado ficam à vista — para você nunca perder de vista o quanto já caminhou.",
    cta: "Marcar meu primeiro horário",
    ctaPage: "agenda",
  },
];

let cardEl = null;
let _bound = false;
let _slideIndex = 0;

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
  const slide = SLIDES[_slideIndex];
  const isLast = _slideIndex === SLIDES.length - 1;

  cardEl.innerHTML = `
    <span class="state-block-icon" aria-hidden="true">${slide.icon}</span>
    <strong class="state-block-title">${slide.title}</strong>
    <span class="state-block-desc">${slide.desc}</span>
    <div class="onboarding-tour-dots" role="presentation">
      ${SLIDES.map((_, i) => `<span class="onboarding-tour-dot${i === _slideIndex ? " is-active" : ""}"></span>`).join("")}
    </div>
    <div class="onboarding-tour-actions">
      <button type="button" class="btn btn-sm btn-ghost" id="onboarding-tour-skip">Pular</button>
      ${slide.cta ? `<button type="button" class="btn btn-sm btn-ghost state-block-action" id="onboarding-tour-cta">${slide.cta}</button>` : ""}
      <button type="button" class="btn btn-sm btn-primary state-block-action" id="onboarding-tour-next">${isLast ? "Vamos começar" : "Continuar"}</button>
    </div>
  `;

  cardEl.querySelector("#onboarding-tour-skip").addEventListener("click", _dismiss);
  cardEl.querySelector("#onboarding-tour-next").addEventListener("click", () => {
    if (isLast) {
      _dismiss();
      return;
    }
    _slideIndex += 1;
    _renderCard();
  });
  const ctaBtn = cardEl.querySelector("#onboarding-tour-cta");
  if (ctaBtn) {
    ctaBtn.addEventListener("click", () => {
      _dismiss();
      showPage(slide.ctaPage);
    });
  }
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

  _slideIndex = 0;
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
