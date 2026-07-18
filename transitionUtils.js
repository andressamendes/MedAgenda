// transitionUtils.js — microinteração compartilhada de "revelar conteúdo"
// (F10 #5.1): usada tanto na troca skeleton→conteúdo real quanto na abertura
// de seções expansíveis (accordions, dropdown do menu de usuário, filtros
// avançados). Pura CSS (@keyframes content-reveal em style.css), então
// prefers-reduced-motion é resolvido pelo navegador via media query — este
// helper não precisa checar matchMedia nem adiar nada, o que o mantém
// síncrono (importante para os testes, que verificam o DOM logo após a
// chamada, sem esperar transitionend/rAF).

const REVEAL_CLASS = "content-reveal";

/**
 * Reinicia a animação de revelação no elemento. Remove a classe antes de
 * reaplicá-la (forçando um reflow) para que o efeito também dispare quando o
 * mesmo elemento é revelado mais de uma vez seguida (ex.: alternar a mesma
 * seção fechada/aberta repetidamente).
 */
export function revealWithAnimation(el) {
  if (!el) return;
  el.classList.remove(REVEAL_CLASS);
  void el.offsetWidth; // força reflow
  el.classList.add(REVEAL_CLASS);
}

// F11 E9 — mesmo princípio acima, aplicado à troca de página inteira
// (showPage()/navigationView.js): um fade+translate mais curto (180ms via
// .page-enter/@keyframes page-enter em style.css) para que a navegação
// pareça viva sem atrasar a percepção de resposta ao clique.
const PAGE_ENTER_CLASS = "page-enter";

export function revealPageWithAnimation(el) {
  if (!el) return;
  el.classList.remove(PAGE_ENTER_CLASS);
  void el.offsetWidth; // força reflow
  el.classList.add(PAGE_ENTER_CLASS);
}
