import { supabase } from './supabase.js';
import { signOut, updatePassword, reauthenticate } from './auth.js';
import { getProfile, upsertProfile } from './profileService.js';
import { uploadAvatar, removeAvatar } from './avatarService.js';
import { toast } from './toastService.js';
import { track, EVENTS } from './telemetryService.js';
import { escapeHtml } from './utils.js';
import { confirmDialog } from './confirmDialog.js';
import { initModal } from './modalController.js';
import { handleError } from './errorService.js';
import { categoryToState, STATES, triggerReauth } from './stateView.js';
import { GOAL_LIMITS, validateGoalMinutes } from './timeGoals.js';

const TIMEZONES = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Belem',
  'America/Fortaleza', 'America/Recife', 'America/Maceio',
  'America/Bahia', 'America/Cuiaba', 'America/Porto_Velho',
  'America/Boa_Vista', 'America/Rio_Branco', 'America/Noronha',
  'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'Europe/Lisbon', 'UTC',
];

let _overlay  = null;
let _profile  = null;
let _userId   = null;
let _modal    = null;

export function initAccountView(userId) {
  _userId = userId;
  // Chamada a cada login (ver script.js/_initApp) — sem esta guarda, um
  // segundo login na mesma sessão de página (após logout, sem reload)
  // registraria um novo modalController (novo listener de Escape/clique-fora
  // em document) e um novo listener em account-close/btn-my-account a cada
  // vez, empilhando handlers indefinidamente.
  if (_overlay) return;

  _overlay = document.getElementById('account-overlay');
  if (!_overlay) return;

  document.getElementById('account-close')?.addEventListener('click', close);
  _modal = initModal(_overlay, close);

  document.getElementById('btn-my-account')?.addEventListener('click', open);
}

/**
 * Chamado no logout (ver script.js) — a próxima sessão de usuário não deve
 * herdar o perfil carregado nem encontrar o modal aberto do usuário anterior.
 */
export function resetAccountView() {
  _profile = null;
  _userId  = null;
  _modal?.close();
  // A1.5 (ETAPA 5) — sem isso, a senha atual/nova senha digitadas pelo
  // usuário anterior ficariam retidas nos campos (ainda montados no DOM, só
  // ocultos pelo modal fechado) até o próximo open() os substituir. O
  // logout precisa limpá-los imediatamente, nunca deixando texto de senha
  // sobrevivendo entre uma sessão de usuário e outra.
  const body = document.getElementById('account-body');
  if (body) body.innerHTML = '';
}

// Auditoria UX #24: o card "Sem meta configurada" do Dashboard não tinha
// nenhum caminho para a configuração (que vive aqui, na seção Metas de
// Tempo). `focusSection: "goals"` permite abrir o modal já rolado até essa
// seção, com foco no primeiro campo — sem criar uma tela nova.
export async function open({ focusSection } = {}) {
  if (!_overlay) return;
  _renderSkeleton();
  _modal.open();

  try {
    _profile = await getProfile();
    _renderProfile(_profile);
    if (focusSection === 'goals') {
      document.getElementById('account-section-goals')?.scrollIntoView?.({ block: 'start' });
      document.getElementById('acc-goal-daily')?.focus();
    }
  } catch (err) {
    handleError(err, { context: 'accountView.loadProfile', silent: true });
    toast.error('Não foi possível carregar o perfil.');
  }
}

export function close() {
  _modal?.close();
}

// ── Skeleton while loading ─────────────────────────────────────────────────
function _renderSkeleton() {
  const body = document.getElementById('account-body');
  if (!body) return;
  body.innerHTML = '<p class="account-loading">Carregando perfil…</p>';
}

// ── Render full profile form ───────────────────────────────────────────────
function _renderProfile(p) {
  const body = document.getElementById('account-body');
  if (!body) return;

  const tzOptions = TIMEZONES.map(tz => {
    const sel = (p?.timezone || 'America/Sao_Paulo') === tz ? 'selected' : '';
    return `<option value="${tz}" ${sel}>${tz}</option>`;
  }).join('');

  const semOpts = ['', '1','2','3','4','5','6','7','8','9','10','11','12'].map(s => {
    const sel = String(p?.semester || '') === s ? 'selected' : '';
    return `<option value="${s}" ${sel}>${s === '' ? '—' : `${s}º`}</option>`;
  }).join('');

  const avatarSrc = p?.avatar_url
    ? escapeHtml(p.avatar_url)
    : `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%23e5e7eb'/%3E%3Ccircle cx='32' cy='24' r='10' fill='%239ca3af'/%3E%3Cellipse cx='32' cy='56' rx='18' ry='12' fill='%239ca3af'/%3E%3C/svg%3E`;

  // F10 PR12 — Perfil/Foto/Metas (edição de rotina) e Senha/Exclusão (ações
  // sensíveis/destrutivas) viviam empilhados num único scroll longo, sem
  // nenhuma separação entre "editar meus dados" e "mudar minha segurança ou
  // apagar minha conta". Duas abas (componente único do design system,
  // .tabs/.tab, ver style.css) separam essas duas naturezas de ação; nenhum
  // campo, valor ou fluxo mudou de lugar dentro de cada seção, só o
  // agrupamento em abas.
  body.innerHTML = `
    <div class="tabs" id="account-tabs" role="tablist">
      <button type="button" class="tab tab--active" id="account-tab-profile" role="tab" aria-selected="true" aria-controls="account-panel-profile">Perfil</button>
      <button type="button" class="tab" id="account-tab-security" role="tab" aria-selected="false" aria-controls="account-panel-security">Segurança e Conta</button>
    </div>

    <div id="account-panel-profile" role="tabpanel">
      <!-- Avatar -->
      <div class="account-section">
        <h3 class="account-section-title">Foto de Perfil</h3>
        <div class="avatar-wrap">
          <img id="avatar-preview" src="${avatarSrc}" alt="Avatar" class="avatar-img" />
          <div class="avatar-actions">
            <label for="avatar-file" class="btn btn-sm btn-ghost" role="button">Alterar foto</label>
            <input type="file" id="avatar-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden />
            <button type="button" class="btn btn-sm btn-ghost" id="btn-remove-avatar" ${p?.avatar_url ? '' : 'hidden'}>Remover foto</button>
          </div>
          <p class="account-hint">JPG, PNG ou WebP — máx. 2 MB</p>
        </div>
      </div>

      <!-- Profile info -->
      <div class="account-section">
        <h3 class="account-section-title">Dados Pessoais</h3>
        <div class="field">
          <label for="acc-name">Nome completo</label>
          <input type="text" id="acc-name" value="${escapeHtml(p?.full_name || '')}" placeholder="Seu nome completo" maxlength="100" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="acc-university">Universidade</label>
            <input type="text" id="acc-university" value="${escapeHtml(p?.university || '')}" placeholder="Ex: USP" maxlength="120" />
          </div>
          <div class="field">
            <label for="acc-course">Curso</label>
            <input type="text" id="acc-course" value="${escapeHtml(p?.course || '')}" placeholder="Ex: Medicina" maxlength="60" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="acc-semester">Semestre</label>
            <select id="acc-semester">${semOpts}</select>
          </div>
          <div class="field">
            <label for="acc-timezone">Fuso horário</label>
            <select id="acc-timezone">${tzOptions}</select>
          </div>
        </div>
        <p id="profile-error" class="error" role="alert" aria-live="assertive"></p>
        <div class="form-actions">
          <button type="button" id="btn-save-profile" class="btn btn-primary">Salvar perfil</button>
        </div>
      </div>

      <!-- Metas de Tempo (F2.2) — apenas informativas, exibidas no Dashboard -->
      <div class="account-section" id="account-section-goals">
        <h3 class="account-section-title">Metas de Tempo</h3>
        <p class="account-hint">Metas pessoais de estudo, em minutos. Deixe em branco para não definir uma meta.</p>
        <div class="field-row">
          <div class="field">
            <label for="acc-goal-daily">Meta diária (min)</label>
            <input type="number" id="acc-goal-daily" min="${GOAL_LIMITS.daily.min}" max="${GOAL_LIMITS.daily.max}"
              value="${p?.daily_goal_minutes ?? ''}" placeholder="Ex: 120" />
          </div>
          <div class="field">
            <label for="acc-goal-weekly">Meta semanal (min)</label>
            <input type="number" id="acc-goal-weekly" min="${GOAL_LIMITS.weekly.min}" max="${GOAL_LIMITS.weekly.max}"
              value="${p?.weekly_goal_minutes ?? ''}" placeholder="Ex: 600" />
          </div>
          <div class="field">
            <label for="acc-goal-monthly">Meta mensal (min)</label>
            <input type="number" id="acc-goal-monthly" min="${GOAL_LIMITS.monthly.min}" max="${GOAL_LIMITS.monthly.max}"
              value="${p?.monthly_goal_minutes ?? ''}" placeholder="Ex: 2400" />
          </div>
        </div>
        <p id="goals-error" class="error" role="alert" aria-live="assertive"></p>
        <div class="form-actions">
          <button type="button" id="btn-save-goals" class="btn btn-primary">Salvar metas</button>
        </div>
      </div>
    </div>

    <div id="account-panel-security" role="tabpanel" hidden>
      <!-- Change password -->
      <div class="account-section">
        <h3 class="account-section-title">Alterar Senha</h3>
        <div class="field">
          <label for="acc-current-pwd">Senha atual</label>
          <input type="password" id="acc-current-pwd" placeholder="Digite sua senha atual" autocomplete="current-password" maxlength="128" />
        </div>
        <div class="field">
          <label for="acc-new-pwd">Nova senha</label>
          <input type="password" id="acc-new-pwd" placeholder="Mínimo 8 caracteres" autocomplete="new-password" maxlength="128" />
        </div>
        <div class="field">
          <label for="acc-confirm-pwd">Confirmar nova senha</label>
          <input type="password" id="acc-confirm-pwd" placeholder="Repita a senha" autocomplete="new-password" maxlength="128" />
        </div>
        <p id="pwd-error" class="error" role="alert" aria-live="assertive"></p>
        <div class="form-actions">
          <button type="button" id="btn-change-pwd" class="btn btn-primary">Alterar senha</button>
        </div>
      </div>

      <!-- Danger zone -->
      <div class="account-section account-danger-zone">
        <h3 class="account-section-title">Zona de Perigo</h3>
        <p class="account-hint">Excluir sua conta remove permanentemente todos os seus dados, compromissos, categorias e notificações. Esta ação não pode ser desfeita.</p>
        <button type="button" id="btn-delete-account" class="btn btn-sm btn-danger">Excluir minha conta</button>
      </div>
    </div>
  `;

  _bindProfileEvents();
}

function _switchAccountTab(tab) {
  const isProfile = tab === 'profile';
  document.getElementById('account-tab-profile')?.classList.toggle('tab--active', isProfile);
  document.getElementById('account-tab-security')?.classList.toggle('tab--active', !isProfile);
  document.getElementById('account-tab-profile')?.setAttribute('aria-selected', String(isProfile));
  document.getElementById('account-tab-security')?.setAttribute('aria-selected', String(!isProfile));
  const profilePanel  = document.getElementById('account-panel-profile');
  const securityPanel = document.getElementById('account-panel-security');
  if (profilePanel)  profilePanel.hidden  = !isProfile;
  if (securityPanel) securityPanel.hidden = isProfile;
}

// ── Event bindings (called after render) ───────────────────────────────────
function _bindProfileEvents() {
  // Tabs
  document.getElementById('account-tab-profile')?.addEventListener('click', () => _switchAccountTab('profile'));
  document.getElementById('account-tab-security')?.addEventListener('click', () => _switchAccountTab('security'));

  // Avatar
  document.getElementById('avatar-file')?.addEventListener('change', _handleAvatarChange);
  document.getElementById('btn-remove-avatar')?.addEventListener('click', _handleRemoveAvatar);

  // Save profile
  document.getElementById('btn-save-profile')?.addEventListener('click', _handleSaveProfile);

  // Save time goals (F2.2)
  document.getElementById('btn-save-goals')?.addEventListener('click', _handleSaveGoals);

  // Change password
  document.getElementById('btn-change-pwd')?.addEventListener('click', _handleChangePassword);

  // Delete account
  document.getElementById('btn-delete-account')?.addEventListener('click', _handleDeleteAccount);
}

// ── Avatar ─────────────────────────────────────────────────────────────────
async function _handleAvatarChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const btn = document.querySelector('label[for="avatar-file"]');
  _setLoading(btn, 'Enviando…', true);

  try {
    const url = await uploadAvatar(file);
    await upsertProfile({ avatar_url: url });
    if (_profile) _profile.avatar_url = url;
    document.getElementById('avatar-preview').src = url;
    document.getElementById('btn-remove-avatar').hidden = false;
    toast.success('Foto atualizada com sucesso.');
  } catch (err) {
    const { friendly } = handleError(err, { context: 'accountView.uploadAvatar', silent: true });
    toast.error(friendly);
  } finally {
    _setLoading(btn, 'Alterar foto', false);
    e.target.value = '';
  }
}

async function _handleRemoveAvatar() {
  const ok = await confirmDialog({
    title:   'Remover foto de perfil',
    message: 'Tem certeza que deseja remover sua foto de perfil?',
    danger:  true,
  });
  if (!ok) return;
  const btn = document.getElementById('btn-remove-avatar');
  _setLoading(btn, 'Removendo…', true);

  try {
    await removeAvatar();
    await upsertProfile({ avatar_url: null });
    if (_profile) _profile.avatar_url = null;
    document.getElementById('avatar-preview').src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%23e5e7eb'/%3E%3Ccircle cx='32' cy='24' r='10' fill='%239ca3af'/%3E%3Cellipse cx='32' cy='56' rx='18' ry='12' fill='%239ca3af'/%3E%3C/svg%3E`;
    btn.hidden = true;
    toast.success('Foto removida.');
  } catch (err) {
    const { friendly } = handleError(err, { context: 'accountView.removeAvatar', silent: true });
    toast.error(friendly);
  } finally {
    _setLoading(btn, 'Remover foto', false);
  }
}

// ── Save profile ───────────────────────────────────────────────────────────
async function _handleSaveProfile() {
  const errEl = document.getElementById('profile-error');
  errEl.textContent = '';

  const full_name  = document.getElementById('acc-name').value.trim();
  const university = document.getElementById('acc-university').value.trim();
  const course     = document.getElementById('acc-course').value.trim();
  const semester   = document.getElementById('acc-semester').value;
  const timezone   = document.getElementById('acc-timezone').value;

  if (!full_name) { errEl.textContent = 'Nome é obrigatório.'; return; }

  const btn = document.getElementById('btn-save-profile');
  _setLoading(btn, 'Salvando…', true);

  try {
    _profile = await upsertProfile({
      full_name,
      university: university || null,
      course:     course     || null,
      semester:   semester   ? parseInt(semester) : null,
      timezone,
    });
    toast.success('Perfil atualizado com sucesso.');
  } catch (err) {
    const { friendly } = handleError(err, {
      context: 'accountView.saveProfile',
      silent: true,
      fallbackMessage: 'Não foi possível salvar o perfil.',
    });
    errEl.textContent = friendly;
  } finally {
    _setLoading(btn, 'Salvar perfil', false);
  }
}

// ── Metas de Tempo (F2.2) ──────────────────────────────────────────────────
async function _handleSaveGoals() {
  const errEl = document.getElementById('goals-error');
  errEl.textContent = '';

  const rawDaily   = document.getElementById('acc-goal-daily').value.trim();
  const rawWeekly  = document.getElementById('acc-goal-weekly').value.trim();
  const rawMonthly = document.getElementById('acc-goal-monthly').value.trim();

  const daily   = validateGoalMinutes(rawDaily, 'daily');
  const weekly  = validateGoalMinutes(rawWeekly, 'weekly');
  const monthly = validateGoalMinutes(rawMonthly, 'monthly');

  const firstError = [daily, weekly, monthly].find(r => !r.valid);
  if (firstError) { errEl.textContent = firstError.error; return; }

  const btn = document.getElementById('btn-save-goals');
  _setLoading(btn, 'Salvando…', true);

  try {
    _profile = await upsertProfile({
      daily_goal_minutes:   daily.value,
      weekly_goal_minutes:  weekly.value,
      monthly_goal_minutes: monthly.value,
    });
    toast.success('Metas atualizadas com sucesso.');
  } catch (err) {
    const { friendly } = handleError(err, {
      context: 'accountView.saveGoals',
      silent: true,
      fallbackMessage: 'Não foi possível salvar as metas.',
    });
    errEl.textContent = friendly;
  } finally {
    _setLoading(btn, 'Salvar metas', false);
  }
}

// ── Change password (A1.5 — reautenticação obrigatória, achado P2) ─────────
// Fluxo: senha atual → nova senha → confirmação → reautenticação
// (auth.js#reauthenticate, via signInWithPassword — a mesma API oficial do
// login) → só então updatePassword(). Uma sessão já aberta nunca basta por
// si só para trocar a senha.
async function _handleChangePassword() {
  const errEl  = document.getElementById('pwd-error');
  errEl.textContent = '';

  const currentPwdInput = document.getElementById('acc-current-pwd');
  const newPwdInput     = document.getElementById('acc-new-pwd');
  const confirmPwdInput = document.getElementById('acc-confirm-pwd');

  const currentPwd = currentPwdInput.value;
  const newPwd     = newPwdInput.value;
  const confirmPwd = confirmPwdInput.value;

  if (!currentPwd)            { errEl.textContent = 'Digite sua senha atual.'; return; }
  if (!newPwd)                { errEl.textContent = 'Digite a nova senha.'; return; }
  if (newPwd.length < 8)      { errEl.textContent = 'A senha deve ter pelo menos 8 caracteres.'; return; }
  if (newPwd !== confirmPwd)  { errEl.textContent = 'As senhas não coincidem.'; return; }

  const btn = document.getElementById('btn-change-pwd');
  _setLoading(btn, 'Verificando senha atual…', true);

  try {
    await reauthenticate(currentPwd);
  } catch (err) {
    const { category, friendly } = handleError(err, {
      context: 'accountView.reauthenticate',
      silent:  true,
      fallbackMessage: 'Não foi possível confirmar sua senha atual.',
    });
    _setLoading(btn, 'Alterar senha', false);

    // categoryToState() sempre traduz a categoria 'auth' inteira para
    // SESSION_EXPIRED — correto para uma sessão de fato morta, mas não para
    // este code específico: 'current_password_incorrect' (ver
    // auth.js#reauthenticate) significa que a sessão continua válida e só a
    // senha atual informada estava errada. Só os demais casos de 'auth'
    // (refresh/JWT/sessão realmente inválidos) seguem o pipeline central
    // (errorService → stateView → forceReauth) — igual a qualquer outra
    // tela do app. showAuthView() (acionado por forceReauth) já fecha este
    // modal.
    if (err?.code !== 'current_password_incorrect' && categoryToState(category) === STATES.SESSION_EXPIRED) {
      triggerReauth();
      return;
    }

    // Senha atual errada: a sessão continua ativa (signInWithPassword() não
    // a encerra) e a nova senha/confirmação já digitadas não são perdidas —
    // só o campo de senha atual é limpo, para a próxima tentativa.
    currentPwdInput.value = '';
    errEl.textContent = friendly;
    return;
  }

  _setLoading(btn, 'Alterando…', true);
  try {
    await updatePassword(newPwd);
    currentPwdInput.value = '';
    newPwdInput.value     = '';
    confirmPwdInput.value = '';
    toast.success('Senha alterada com sucesso.');
  } catch (err) {
    const { category, friendly } = handleError(err, {
      context: 'accountView.changePassword',
      silent:  true,
      fallbackMessage: 'Não foi possível alterar a senha.',
    });
    if (categoryToState(category) === STATES.SESSION_EXPIRED) {
      triggerReauth();
      return;
    }
    errEl.textContent = friendly;
  } finally {
    _setLoading(btn, 'Alterar senha', false);
  }
}

// ── Delete account ─────────────────────────────────────────────────────────
async function _handleDeleteAccount() {
  const confirmed = await confirmDialog({
    title:       'Excluir conta',
    message:     'ATENÇÃO: Esta ação é irreversível.\n\n' +
                 'Todos os seus dados serão excluídos permanentemente:\n' +
                 '• Compromissos e categorias\n' +
                 '• Notificações e assinaturas\n' +
                 '• Foto de perfil\n\n' +
                 'Tem certeza que deseja excluir sua conta?',
    confirmText: 'Excluir conta',
    danger:      true,
  });
  if (!confirmed) return;

  const btn = document.getElementById('btn-delete-account');
  _setLoading(btn, 'Excluindo…', true);

  try {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) throw error;
    await signOut();
    toast.info('Conta excluída. Até logo!');
  } catch (err) {
    const { friendly } = handleError(err, {
      context: 'accountView.deleteAccount',
      silent: true,
      fallbackMessage: 'Não foi possível excluir a conta. Tente novamente.',
    });
    _setLoading(btn, 'Excluir minha conta', false);
    toast.error(friendly);
  }
}

// ── Helper ─────────────────────────────────────────────────────────────────
function _setLoading(btn, label, loading) {
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = label;
}
