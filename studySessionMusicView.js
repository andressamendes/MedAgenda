// ── studySessionMusicView.js — Música de fundo (ferramenta auxiliar da Sessão
// de Estudo) ─────────────────────────────────────────────────────────────────
//
// Único ponto de contato do projeto com o YouTube. Isolado deliberadamente
// (nenhum outro módulo importa `window.YT` ou fala com este domínio) — se a
// integração precisar mudar de mecanismo no futuro, é um módulo só.
//
// Mecanismo escolhido: a IFrame Player API OFICIAL do YouTube
// (https://developers.google.com/youtube/iframe_api_reference), controlada
// via `YT.Player` (playVideo/pauseVideo/stopVideo/destroy) — não o protocolo
// postMessage cru que a API usa por baixo. A alternativa "postMessage direto
// contra o iframe, sem carregar o script da API" foi avaliada e descartada:
// não é uma superfície pública documentada pelo YouTube (é implementação
// interna da própria API oficial, redescoberta por engenharia reversa em
// blogs/gists) — o requisito explícito de usar "somente mecanismo
// oficial/permitido" pesa contra ela, mesmo custando um domínio a mais em
// script-src (ver index.html) do que a variante crua exigiria.
//
// Carregamento: o script `https://www.youtube.com/iframe_api` só é inserido
// no DOM na primeira vez que o usuário liga a música (enableMusic()) — nunca
// no boot da tela. Isso cumpre "sem autoplay inesperado" (o player só existe
// depois de um gesto do usuário) e "sem iframe pesado carregado quando a
// música não está em uso".
//
// Este módulo não sabe nada sobre `activitySessionService`/lifecycle da
// sessão real — quem decide QUANDO chamar enable/pause/resume/disable é
// studySessionView.js (mesma divisão de responsabilidade de pomodoroTimer.js:
// aqui só o mecanismo, lá a orquestração).

// Faixa fornecida pelo produto (playlist de estudo,
// https://www.youtube.com/watch?v=fPK91HGJsNk) — só o id do vídeo é usado.
const VIDEO_ID = "fPK91HGJsNk";
const MOUNT_ID = "ss-music-player-mount";
const API_SRC = "https://www.youtube.com/iframe_api";

let _apiLoadPromise = null;
let _player = null; // instância YT.Player — só existe entre enableMusic() e disableMusic()
let _state = "off"; // "off" | "playing" | "paused" — refletido, nunca decidido por quem chama
let _onStateChange = null;

function _loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (_apiLoadPromise) return _apiLoadPromise;

  _apiLoadPromise = new Promise((resolve, reject) => {
    // A API do YouTube chama este callback global quando termina de carregar
    // — encadeia com um handler pré-existente em vez de sobrescrevê-lo (outra
    // integração da página, improvável aqui, mas é o padrão documentado).
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = API_SRC;
    script.onerror = () => reject(new Error("Falha ao carregar a API do YouTube"));
    document.head.appendChild(script);
  });
  return _apiLoadPromise;
}

function _setState(next) {
  if (_state === next) return;
  _state = next;
  _onStateChange?.(_state);
}

/** Estado atual, sempre um dos três valores documentados acima. */
export function getMusicState() {
  return _state;
}

/**
 * Registra o callback chamado a cada mudança de estado (para studySessionView
 * refletir o toggle/label na tela). Chamar de novo substitui o anterior —
 * não é uma lista de assinantes, só um consumidor por vez (mesmo padrão de
 * `initStudySessionView` que só monta a tela uma vez).
 */
export function initMusicControl({ onStateChange } = {}) {
  _onStateChange = onStateChange || null;
}

/** Liga a música: cria o player (se ainda não existir) e começa a tocar. Sempre chamado a partir de um gesto do usuário — nunca automaticamente. */
export async function enableMusic() {
  if (_state !== "off") return;

  if (_player) {
    _player.playVideo();
    return;
  }

  const mount = document.getElementById(MOUNT_ID);
  if (!mount) return;

  try {
    await _loadApi();
  } catch {
    return; // falha ao carregar a API — permanece "off", sem travar a tela
  }

  _player = new window.YT.Player(mount, {
    videoId: VIDEO_ID,
    playerVars: {
      playsinline: 1,   // iOS: nunca força fullscreen (§ mobile/PWA do plano)
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
    },
    events: {
      onReady: (e) => e.target.playVideo(),
      onStateChange: (e) => {
        const YT = window.YT;
        if (e.data === YT.PlayerState.PLAYING) _setState("playing");
        else if (e.data === YT.PlayerState.PAUSED) _setState("paused");
      },
      onError: () => _setState("off"),
    },
  });
}

/** Pausa a reprodução sem destruir o player (retomar é instantâneo). */
export function pauseMusic() {
  if (_state !== "playing" || !_player) return;
  _player.pauseVideo();
}

/** Retoma a reprodução de onde parou. */
export function resumeMusic() {
  if (_state !== "paused" || !_player) return;
  _player.playVideo();
}

/** Desliga por completo: para o player e destrói o iframe — nada de música
 * continua existindo no DOM depois disto (chamado ao finalizar/cancelar a
 * sessão, no logout, e pelo próprio toggle "Música"). */
export function disableMusic() {
  if (_player) {
    try { _player.stopVideo(); } catch { /* player já pode ter sido destruído */ }
    try { _player.destroy(); } catch { /* idem */ }
    _player = null;
  }
  _setState("off");
}

/** Volume 0–100, quando o player já existe — controle discreto opcional. */
export function setMusicVolume(percent) {
  if (!_player?.setVolume) return;
  _player.setVolume(Math.min(100, Math.max(0, percent)));
}
