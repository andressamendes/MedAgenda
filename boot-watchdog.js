// boot-watchdog.js — vigia de inicialização (F11 E4).
//
// Script clássico (SEM type="module"), carregado em index.html antes de
// script.js — só assim ele continua rodando mesmo que o grafo de módulos ES
// falhe ao linkar (ex.: o import do SDK do Supabase via CDN jsDelivr falha
// por rede/firewall/DNS). Nesse caso nenhuma linha de script.js executa —
// nem initTheme(), nem nada — e o spinner de #app-loading gira para sempre,
// sem qualquer mensagem para quem está usando o app.
//
// script.js define `window.__anotiBooted = true` como a primeiríssima
// instrução do seu corpo, logo após os imports (que são resolvidos antes de
// qualquer código do módulo rodar) — só chega lá se o grafo linkou com
// sucesso. Se esse sinal não chegar dentro do prazo, este script substitui o
// spinner por uma mensagem de erro com "Tentar novamente".
//
// Duplica aqui, como string estática, o mesmo SVG de iconWifiOff/icons.js e
// as mesmas classes .state-block-* de style.css — não importa nada de
// script.js ou de qualquer módulo ES de propósito: um `import()` dinâmico
// ainda seria uma operação de rede sujeita à mesma falha que este script
// existe para cobrir.
(function () {
  "use strict";

  var TIMEOUT_MS = 8000;

  setTimeout(function () {
    if (window.__anotiBooted) return;

    var target = document.getElementById("app-loading");
    if (!target || target.hidden) return; // já saiu da tela de carregamento por outro caminho

    target.setAttribute("role", "alert");
    target.setAttribute("aria-live", "assertive");
    target.removeAttribute("aria-label");

    target.innerHTML =
      '<div class="app-loading-logo brand-mark">' +
        '<svg class="brand-mark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M4.5 19 12 4.5 19.5 19"/><path d="M7.7 14h8.6"/></svg>' +
        "<span>Anoti</span>" +
      "</div>" +
      '<div class="state-block">' +
        '<span class="state-block-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><line x1="2" y1="2" x2="22" y2="22"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.5a10 10 0 0 1 3-2.1"/><path d="M19 12.5a10 10 0 0 0-2.7-2"/><path d="M2 8.8a15 15 0 0 1 4.2-2.7"/><path d="M22 8.8a15 15 0 0 0-8-3.6"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg></span>' +
        '<strong class="state-block-title">Não foi possível carregar o Anoti</strong>' +
        '<span class="state-block-desc">Verifique sua conexão com a internet e tente novamente.</span>' +
        '<button type="button" class="btn btn-sm btn-primary state-block-action" id="boot-watchdog-retry">Tentar novamente</button>' +
      "</div>";

    var retryBtn = document.getElementById("boot-watchdog-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () { window.location.reload(); });
    }
  }, TIMEOUT_MS);
})();
