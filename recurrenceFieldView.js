// ── recurrenceFieldView.js — bloco de recorrência compartilhado (F16) ──────
//
// Mesmo bloco de UI (Repetir → Frequência, Intervalo, Dias da semana, Fim da
// recorrência) reaproveitado por eventFormView.js (Compromissos) e
// academicCalendarEventsView.js (Eventos de Calendário Acadêmico) — nenhuma
// lógica de recorrência é reimplementada nos formulários, só chamadas a
// bind/read/populate/reset abaixo, parametrizadas por um "prefixo" de ids.
//
// O formulário de Compromissos já existia em index.html com um conjunto de
// ids fixos (legado); o de Eventos Acadêmicos é montado dinamicamente por
// template string (mesmo padrão do restante de academicCalendarEventsView.js)
// — renderRecurrenceFieldsHTML() gera exatamente o mesmo HTML para ele, com
// ids no padrão "acev-recurrence-*". IDS(prefix) é o único lugar que sabe
// mapear cada prefixo para seus ids reais.

const LEGACY_F_IDS = {
  toggleBtn: "btn-recurrence-toggle",
  wrap:      "f-recurrence-wrap",
  select:    "f-recurrence",
  extra:     "recurrence-extra",
  custom:    "recurrence-custom",
  interval:  "f-recurrence-interval",
  daysWrap:  "f-recurrence-days",
  endNever:  "f-recurrence-end-never",
  endUntil:  "f-recurrence-end-until",
  endCount:  "f-recurrence-end-count",
  until:     "f-recurrence-until",
  count:     "f-recurrence-count",
  untilWrap: "f-recurrence-until-wrap",
  countWrap: "f-recurrence-count-wrap",
};

function IDS(prefix) {
  if (prefix === "f") return LEGACY_F_IDS;
  return {
    toggleBtn: `${prefix}-recurrence-toggle`,
    wrap:      `${prefix}-recurrence-wrap`,
    select:    `${prefix}-recurrence`,
    extra:     `${prefix}-recurrence-extra`,
    custom:    `${prefix}-recurrence-custom`,
    interval:  `${prefix}-recurrence-interval`,
    daysWrap:  `${prefix}-recurrence-days`,
    endNever:  `${prefix}-recurrence-end-never`,
    endUntil:  `${prefix}-recurrence-end-until`,
    endCount:  `${prefix}-recurrence-end-count`,
    until:     `${prefix}-recurrence-until`,
    count:     `${prefix}-recurrence-count`,
    untilWrap: `${prefix}-recurrence-until-wrap`,
    countWrap: `${prefix}-recurrence-count-wrap`,
  };
}

function els(prefix) {
  const ids = IDS(prefix);
  const out = {};
  for (const [key, id] of Object.entries(ids)) out[key] = document.getElementById(id);
  return out;
}

/**
 * Gera o HTML do bloco de recorrência para um prefixo — usado apenas pelo
 * formulário de Eventos Acadêmicos, montado via template string
 * (academicCalendarEventsView.js). O formulário de Compromissos usa o
 * equivalente estático já presente em index.html (ids LEGACY_F_IDS acima) —
 * os dois blocos têm a mesma estrutura e são acionados pelas MESMAS funções
 * deste módulo.
 */
export function renderRecurrenceFieldsHTML(prefix) {
  const ids = IDS(prefix);
  return `
    <div class="field" id="${prefix}-recurrence-field">
      <button type="button" id="${ids.toggleBtn}" class="btn btn-ghost btn-sm">+ Repetir</button>
      <div id="${ids.wrap}" hidden>
        <label for="${ids.select}">Repetição</label>
        <select id="${ids.select}">
          <option value="none">Nunca</option>
          <option value="daily">Diariamente</option>
          <option value="weekdays">Dias úteis (Seg–Sex)</option>
          <option value="weekly">Semanalmente</option>
          <option value="biweekly">Quinzenalmente</option>
          <option value="monthly">Mensalmente</option>
          <option value="yearly">Anualmente</option>
          <option value="custom">Personalizada</option>
        </select>
      </div>
    </div>
    <div id="${ids.extra}" class="recurrence-extra-block" hidden>
      <div id="${ids.custom}" class="recurrence-custom-block" hidden>
        <div class="field">
          <label>Intervalo</label>
          <div class="recurrence-interval-row">
            A cada
            <input type="number" id="${ids.interval}" value="1" min="1" max="52" />
            semana(s)
          </div>
        </div>
        <div class="field">
          <label>Dias da semana</label>
          <div class="recurrence-days-wrap" id="${ids.daysWrap}">
            <button type="button" class="day-btn" data-day="1">Seg</button>
            <button type="button" class="day-btn" data-day="2">Ter</button>
            <button type="button" class="day-btn" data-day="3">Qua</button>
            <button type="button" class="day-btn" data-day="4">Qui</button>
            <button type="button" class="day-btn" data-day="5">Sex</button>
            <button type="button" class="day-btn" data-day="6">Sáb</button>
            <button type="button" class="day-btn" data-day="0">Dom</button>
          </div>
        </div>
      </div>
      <div class="field">
        <label>Fim da recorrência</label>
        <div class="recurrence-end-row">
          <label class="recurrence-end-option">
            <input type="radio" name="${prefix}-recurrence-end" id="${ids.endNever}" value="never" checked>
            Nunca
          </label>
          <label class="recurrence-end-option">
            <input type="radio" name="${prefix}-recurrence-end" id="${ids.endUntil}" value="until">
            Em uma data
          </label>
          <label class="recurrence-end-option">
            <input type="radio" name="${prefix}-recurrence-end" id="${ids.endCount}" value="count">
            Após N ocorrências
          </label>
        </div>
        <div id="${ids.untilWrap}" hidden>
          <input type="date" id="${ids.until}" />
        </div>
        <div id="${ids.countWrap}" hidden>
          <input type="number" id="${ids.count}" min="1" max="730" placeholder="Número de ocorrências" />
        </div>
      </div>
    </div>
  `;
}

/** Liga os listeners de disclosure/troca de tipo/dias/fim para um prefixo. Idempotente por chamada — cada formulário chama uma única vez na sua própria inicialização. */
export function bindRecurrenceFields(prefix) {
  const e = els(prefix);
  if (!e.select) return;

  e.toggleBtn?.addEventListener("click", () => showRecurrenceField(prefix, { focus: true }));

  e.select.addEventListener("change", () => {
    const v = e.select.value;
    if (e.extra)  e.extra.hidden  = v === "none";
    if (e.custom) e.custom.hidden = v !== "custom";
  });

  [e.endNever, e.endUntil, e.endCount].forEach(radio => {
    radio?.addEventListener("change", () => _syncEndMode(e));
  });

  e.daysWrap?.querySelectorAll(".day-btn").forEach(btn => {
    btn.addEventListener("click", () => btn.classList.toggle("day-btn-active"));
  });
}

function _syncEndMode(e) {
  const mode = e.endUntil?.checked ? "until" : e.endCount?.checked ? "count" : "never";
  if (e.untilWrap) e.untilWrap.hidden = mode !== "until";
  if (e.countWrap) e.countWrap.hidden = mode !== "count";
}

export function showRecurrenceField(prefix, { focus = false } = {}) {
  const e = els(prefix);
  if (!e.wrap) return;
  e.wrap.hidden = false;
  if (e.toggleBtn) e.toggleBtn.hidden = true;
  if (focus) e.select?.focus();
}

function _selectedDays(daysWrapEl) {
  if (!daysWrapEl) return "";
  return Array.from(daysWrapEl.querySelectorAll(".day-btn.day-btn-active"))
    .map(b => b.dataset.day)
    .join(",");
}

function _setSelectedDays(daysWrapEl, str) {
  if (!daysWrapEl) return;
  const days = str ? str.split(",") : [];
  daysWrapEl.querySelectorAll(".day-btn").forEach(btn => {
    btn.classList.toggle("day-btn-active", days.includes(btn.dataset.day));
  });
}

/**
 * Lê o bloco e devolve os campos prontos para gravar em `events`/
 * `academic_events` — sempre as 5 colunas, mesmo quando "Nunca" está
 * selecionado (recurrence_type: "none", resto null).
 */
export function readRecurrenceFields(prefix) {
  const e = els(prefix);
  const type = e.select?.value || "none";
  const isCustom = type === "custom";
  const endMode = e.endUntil?.checked ? "until" : e.endCount?.checked ? "count" : "never";

  return {
    recurrence_type:         type,
    recurrence_interval:     isCustom ? (parseInt(e.interval?.value) || 1) : null,
    recurrence_days_of_week: isCustom ? (_selectedDays(e.daysWrap) || null) : null,
    recurrence_until:        type !== "none" && endMode === "until" ? (e.until?.value || null) : null,
    recurrence_count:        type !== "none" && endMode === "count" ? (parseInt(e.count?.value) || null) : null,
  };
}

/** Preenche o bloco a partir de um evento existente (edição). */
export function populateRecurrenceFields(prefix, ev) {
  const e = els(prefix);
  if (!e.select) return;

  e.select.value = ev.recurrence_type || "none";
  if (e.interval) e.interval.value = ev.recurrence_interval || 1;
  if (e.until)    e.until.value    = ev.recurrence_until || "";
  if (e.count)    e.count.value    = ev.recurrence_count || "";
  _setSelectedDays(e.daysWrap, ev.recurrence_days_of_week || "");

  const endMode = ev.recurrence_count ? "count" : ev.recurrence_until ? "until" : "never";
  if (e.endNever) e.endNever.checked = endMode === "never";
  if (e.endUntil) e.endUntil.checked = endMode === "until";
  if (e.endCount) e.endCount.checked = endMode === "count";
  _syncEndMode(e);

  if (e.select.value !== "none") showRecurrenceField(prefix);
  e.select.dispatchEvent(new Event("change"));
}

/** Reseta o bloco para o estado de um formulário novo (fechado, sem regra). */
export function resetRecurrenceFields(prefix) {
  const e = els(prefix);
  if (!e.select) return;

  e.select.value = "none";
  if (e.interval) e.interval.value = 1;
  if (e.until)    e.until.value    = "";
  if (e.count)    e.count.value    = "";
  if (e.endNever) e.endNever.checked = true;
  if (e.endUntil) e.endUntil.checked = false;
  if (e.endCount) e.endCount.checked = false;
  _setSelectedDays(e.daysWrap, "");
  _syncEndMode(e);

  if (e.extra)  e.extra.hidden  = true;
  if (e.custom) e.custom.hidden = true;
  if (e.wrap)   e.wrap.hidden   = true;
  if (e.toggleBtn) e.toggleBtn.hidden = false;
}
