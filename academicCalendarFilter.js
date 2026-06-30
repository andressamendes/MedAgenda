import { escapeHtml } from "./utils.js";

// ── Constants ──────────────────────────────────────────────────────────────

const FILTER_KEY_PERSONAL = "medagenda_filter_personal";
const FILTER_KEY_ACADEMIC  = "medagenda_filter_academic";

// ── Filter state ───────────────────────────────────────────────────────────

export function isPersonalVisible() {
  try { const v = localStorage.getItem(FILTER_KEY_PERSONAL); return v === null || v === "1"; }
  catch { return true; }
}

export function setPersonalVisible(val) {
  try { localStorage.setItem(FILTER_KEY_PERSONAL, val ? "1" : "0"); } catch {}
}

function getAcademicFilter() {
  try { const v = localStorage.getItem(FILTER_KEY_ACADEMIC); return v ? JSON.parse(v) : {}; }
  catch { return {}; }
}

function setAcademicFilter(obj) {
  try { localStorage.setItem(FILTER_KEY_ACADEMIC, JSON.stringify(obj)); } catch {}
}

export function isCalendarVisible(calendarId) {
  return getAcademicFilter()[calendarId] !== false;
}

export function setCalendarVisible(calendarId, visible) {
  const f = getAcademicFilter();
  f[calendarId] = visible;
  setAcademicFilter(f);
}

// ── Filter bar ─────────────────────────────────────────────────────────────

export function renderFilterBar(containerId, calendarsCache, onChangeCb) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  const html = `
    <span class="filter-label">Exibir:</span>
    <label class="filter-toggle">
      <input type="checkbox" id="chk-personal" ${isPersonalVisible() ? "checked" : ""}>
      <span>Compromissos pessoais</span>
    </label>
    ${calendarsCache.map(c => `
      <label class="filter-toggle">
        <input type="checkbox" id="chk-cal-${c.id}"
          ${isCalendarVisible(c.id) ? "checked" : ""}
          data-calid="${escapeHtml(c.id)}">
        <span class="filter-cal-dot" style="background:${escapeHtml(c.color)}"></span>
        <span>${escapeHtml(c.name)}</span>
      </label>
    `).join("")}
  `;
  wrap.innerHTML = html;

  document.getElementById("chk-personal")?.addEventListener("change", e => {
    setPersonalVisible(e.target.checked);
    onChangeCb?.();
  });

  wrap.querySelectorAll("[data-calid]").forEach(chk => {
    chk.addEventListener("change", e => {
      setCalendarVisible(e.target.dataset.calid, e.target.checked);
      onChangeCb?.();
    });
  });
}
