const TYPES = {
  success: { icon: '✓', label: 'Sucesso' },
  error:   { icon: '✕', label: 'Erro' },
  warning: { icon: '!', label: 'Aviso' },
  info:    { icon: 'i', label: 'Informação' },
};

const MAX_TOASTS = 5;
let _container = null;

function getContainer() {
  if (!_container) _container = document.getElementById('toast-container');
  return _container;
}

export function showToast(message, type = 'info', duration = 4500) {
  const c = getContainer();
  if (!c) return;

  const existing = c.querySelectorAll('.toast');
  if (existing.length >= MAX_TOASTS) existing[0].remove();

  const cfg = TYPES[type] || TYPES.info;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-label', `${cfg.label}: ${message}`);
  el.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${cfg.icon}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Fechar notificação">✕</button>
  `;

  const dismiss = () => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 300);
  };

  el.querySelector('.toast-close').addEventListener('click', dismiss);
  c.appendChild(el);

  requestAnimationFrame(() => el.classList.add('toast-in'));

  if (duration > 0) setTimeout(dismiss, duration);

  return dismiss;
}

export const toast = {
  success: (msg, dur) => showToast(msg, 'success', dur),
  error:   (msg, dur) => showToast(msg, 'error',   dur),
  warning: (msg, dur) => showToast(msg, 'warning', dur),
  info:    (msg, dur) => showToast(msg, 'info',    dur),
};
