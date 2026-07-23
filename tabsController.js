// ── tabsController.js — padrão WAI-ARIA Tabs aplicado às 4 superfícies com
// abas (Agenda, Diário, modal de início de sessão, tema). Cada chamador
// continua dono da lógica de seleção (troca de painel, aria-selected,
// persistência) — este helper só cuida do que era comum e estava faltando
// em todas elas: roving tabindex e navegação por teclado (←/→, Home, End).
//
// onActivate(tab) é chamado tanto no clique quanto na navegação por seta —
// é o mesmo "ativação automática" que o restante do produto já assumia
// implicitamente ao vincular clique em cada botão de aba.

export function initTabs(tablistEl, onActivate) {
  if (!tablistEl) return;

  const tabs = () => Array.from(tablistEl.querySelectorAll('[role="tab"]'));
  const visibleTabs = () => tabs().filter(t => !t.hidden);

  tabs().forEach(tab => {
    tab.addEventListener("click", () => onActivate(tab));
  });

  tablistEl.addEventListener("keydown", e => {
    const list = visibleTabs();
    const currentIdx = list.indexOf(document.activeElement);
    if (currentIdx === -1) return;

    let nextIdx;
    if (e.key === "ArrowRight") nextIdx = (currentIdx + 1) % list.length;
    else if (e.key === "ArrowLeft") nextIdx = (currentIdx - 1 + list.length) % list.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = list.length - 1;
    else return;

    e.preventDefault();
    const next = list[nextIdx];
    next.focus();
    onActivate(next);
  });
}

// Aplica o roving tabindex (tab ativa = 0, demais = -1) a partir do
// aria-selected já atribuído pela lógica de seleção do chamador. Chamar
// sempre que o conjunto de abas visíveis ou a seleção mudar.
export function updateTabsRovingIndex(tablistEl) {
  if (!tablistEl) return;
  const tabs = Array.from(tablistEl.querySelectorAll('[role="tab"]'));
  const selected = tabs.find(t => !t.hidden && t.getAttribute("aria-selected") === "true");
  tabs.forEach(t => { t.tabIndex = t === selected ? 0 : -1; });
}
