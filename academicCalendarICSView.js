import {
  getAcademicEvents, bulkInsertAcademicEvents,
} from "./academicCalendarService.js";
import { parseICS, deduplicateEvents } from "./icsImporter.js";
import { exportToICS, downloadICS } from "./icsExporter.js";
import { toast } from "./toastService.js";
import { confirmDialog } from "./confirmDialog.js";
import { handleError } from "./errorService.js";

// ── Module deps — set via initICSView ─────────────────────────────────────

let _getCalendarsCache;
let _getActiveCalendar;
let _getOnChange;
let _showEventList;
let _showCalendarList;

export function initICSView({
  getCalendarsCache, getActiveCalendar, getOnChange,
  showEventList, showCalendarList,
}) {
  _getCalendarsCache  = getCalendarsCache;
  _getActiveCalendar  = getActiveCalendar;
  _getOnChange        = getOnChange;
  _showEventList      = showEventList;
  _showCalendarList   = showCalendarList;
}

// ── ICS Import ─────────────────────────────────────────────────────────────

export function triggerICSImport(calId) {
  const input = document.createElement("input");
  input.type   = "file";
  input.accept = ".ics,text/calendar";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    await handleICSImport(calId, file);
  });
  input.click();
}

async function handleICSImport(calId, file) {
  const cal     = _getCalendarsCache().find(c => c.id === calId);
  const content = await file.text();
  const parsed  = parseICS(content);

  if (parsed.length === 0) {
    toast.warning("Nenhum evento encontrado no arquivo ICS.");
    return;
  }

  let existing = [];
  try { existing = await getAcademicEvents(calId); } catch {}

  const { unique, duplicates } = deduplicateEvents(parsed, existing);

  if (unique.length === 0) {
    toast.info(`Todos os ${duplicates} eventos já existem no calendário.`);
    return;
  }

  const confirmed = await confirmDialog({
    title:       'Importar eventos',
    message:     `Importar ${unique.length} evento(s) para "${cal?.name}"?` +
                 (duplicates > 0 ? `\n(${duplicates} duplicados serão ignorados)` : ''),
    confirmText: 'Importar',
  });
  if (!confirmed) return;

  try {
    const records = unique.map(ev => ({ ...ev, calendar_id: calId }));
    await bulkInsertAcademicEvents(records);
    toast.success(`${unique.length} evento(s) importado(s) com sucesso.`);
    _getOnChange()?.();
    if (_getActiveCalendar()?.id === calId) {
      await _showEventList(calId);
    } else {
      await _showCalendarList();
    }
  } catch (err) {
    const { friendly } = handleError(err, { context: 'academicCalendarICSView.import', silent: true, fallbackMessage: "Erro ao importar eventos." });
    toast.error(friendly);
  }
}

// ── ICS Export ─────────────────────────────────────────────────────────────

export async function handleICSExport(calId) {
  const cal = _getCalendarsCache().find(c => c.id === calId);
  if (!cal) return;
  try {
    const events  = await getAcademicEvents(calId);
    const content = exportToICS(cal, events);
    downloadICS(content, cal.name);
    toast.success(`Calendário "${cal.name}" exportado.`);
  } catch (err) {
    const { friendly } = handleError(err, { context: 'academicCalendarICSView.export', silent: true, fallbackMessage: "Erro ao exportar calendário." });
    toast.error(friendly);
  }
}
