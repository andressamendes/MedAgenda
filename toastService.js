const TYPES = {
  success: { icon: '✓', label: 'Sucesso' },
  error:   { icon: '✕', label: 'Erro' },
  warning: { icon: '!', label: 'Aviso' },
  info:    { icon: 'i', label: 'Informação' },
};

const MAX_TOASTS = 5;

// Sem cache: em produção o documento nunca muda, então isto sempre resolveu
// para o mesmo nó — mas cachear a referência presumia essa identidade estável
// de `document`, que os testes (installDom()/uninstallDom() por teste) não
// garantem. getElementById() é barato e chamado só uma vez por toast.
function getContainer() {
  return document.getElementById('toast-container');
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
    <span class="toast-message"></span>
    <button class="toast-close" aria-label="Fechar notificação">✕</button>
  `;
  el.querySelector('.toast-message').textContent = message;

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
