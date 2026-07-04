import { supabase } from './supabase.js';
import { updatePassword } from './auth.js';
import { getProfile, upsertProfile } from './profileService.js';
import { uploadAvatar, removeAvatar } from './avatarService.js';
import { toast } from './toastService.js';
import { track, EVENTS } from './telemetryService.js';
import { escapeHtml } from './utils.js';
import { confirmDialog } from './confirmDialog.js';
import { initModal } from './modalController.js';
import { handleError } from './errorService.js';

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
  _userId  = userId;
  _overlay = document.getElementById('account-overlay');
  if (!_overlay) return;

  document.getElementById('account-close')?.addEventListener('click', close);
  _modal = initModal(_overlay, close);

  document.getElementById('btn-my-account')?.addEventListener('click', open);
}

export async function open() {
  if (!_overlay) return;
  _renderSkeleton();
  _modal.open();

  try {
    _profile = await getProfile();
    _renderProfile(_profile);
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

  body.innerHTML = `
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

    <!-- Change password -->
    <div class="account-section">
      <h3 class="account-section-title">Alterar Senha</h3>
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
  `;

  _bindProfileEvents();
}

// ── Event bindings (called after render) ───────────────────────────────────
function _bindProfileEvents() {
  // Avatar
  document.getElementById('avatar-file')?.addEventListener('change', _handleAvatarChange);
  document.getElementById('btn-remove-avatar')?.addEventListener('click', _handleRemoveAvatar);

  // Save profile
  document.getElementById('btn-save-profile')?.addEventListener('click', _handleSaveProfile);

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
    handleError(err, { context: 'accountView.saveProfile', silent: true });
    errEl.textContent = err.message || 'Não foi possível salvar o perfil.';
  } finally {
    _setLoading(btn, 'Salvar perfil', false);
  }
}

// ── Change password ────────────────────────────────────────────────────────
async function _handleChangePassword() {
  const errEl  = document.getElementById('pwd-error');
  errEl.textContent = '';

  const newPwd     = document.getElementById('acc-new-pwd').value;
  const confirmPwd = document.getElementById('acc-confirm-pwd').value;

  if (!newPwd)                   { errEl.textContent = 'Digite a nova senha.'; return; }
  if (newPwd.length < 8)         { errEl.textContent = 'A senha deve ter pelo menos 8 caracteres.'; return; }
  if (newPwd !== confirmPwd)     { errEl.textContent = 'As senhas não coincidem.'; return; }

  const btn = document.getElementById('btn-change-pwd');
  _setLoading(btn, 'Alterando…', true);

  try {
    await updatePassword(newPwd);
    document.getElementById('acc-new-pwd').value     = '';
    document.getElementById('acc-confirm-pwd').value = '';
    toast.success('Senha alterada com sucesso.');
  } catch (err) {
    handleError(err, { context: 'accountView.changePassword', silent: true });
    errEl.textContent = err.message || 'Não foi possível alterar a senha.';
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
    await supabase.auth.signOut();
    toast.info('Conta excluída. Até logo!');
  } catch (err) {
    handleError(err, { context: 'accountView.deleteAccount', silent: true });
    _setLoading(btn, 'Excluir minha conta', false);
    toast.error(err.message || 'Não foi possível excluir a conta. Tente novamente.');
  }
}

// ── Helper ─────────────────────────────────────────────────────────────────
function _setLoading(btn, label, loading) {
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = label;
}
