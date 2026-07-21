// ── recurrenceService.js — domínio de recorrência compartilhado ────────────
//
// Único lugar que decide o que significa editar/excluir "apenas esta
// ocorrência" / "esta e as próximas" / "toda a série" — reaproveitado tanto
// pelo formulário de Compromissos (eventFormView.js) quanto pelo de Eventos
// de Calendário Acadêmico (academicCalendarEventsView.js). Nenhuma lógica de
// recorrência deve ser reimplementada nos formulários (ver F16).
//
// Estratégia (ver docs/F16_RECORRENCIA.md): a série nunca é materializada —
// occurrences são geradas dinamicamente por recurrence-core.js. "Apenas
// esta" grava uma exceção pontual (recurrence_exceptions); "esta e as
// próximas" divide a série em duas linhas-base (trunca a original em
// recurrence_until e cria uma nova linha a partir da ocorrência escolhida);
// "toda a série" atualiza/exclui a linha-base diretamente.

import { createEvent, updateEvent, deleteEvent, getEventById } from "./eventService.js";
import {
  createAcademicEvent, updateAcademicEvent, deleteAcademicEvent, getAcademicEventById,
} from "./academicCalendarService.js";
import {
  overrideOccurrence, cancelOccurrence, deleteExceptionsForBase,
} from "./recurrenceExceptionsService.js";

export const SCOPE = { THIS: "this", FUTURE: "future", SERIES: "series" };

// Campos que descrevem a REGRA de recorrência, não a ocorrência em si — uma
// exceção pontual ("apenas esta") nunca pode carregar sua própria regra.
const RECURRENCE_RULE_KEYS = [
  "recurrence_type", "recurrence_interval", "recurrence_until",
  "recurrence_count", "recurrence_days_of_week",
];

const ADAPTERS = {
  events: {
    dateField: "event_date",
    create: createEvent, update: updateEvent, remove: deleteEvent, getById: getEventById,
  },
  academic_events: {
    dateField: "start_date",
    create: createAcademicEvent, update: updateAcademicEvent, remove: deleteAcademicEvent, getById: getAcademicEventById,
  },
};

function adapterFor(sourceTable) {
  const adapter = ADAPTERS[sourceTable];
  if (!adapter) throw new Error(`recurrenceService: fonte desconhecida "${sourceTable}"`);
  return adapter;
}

export function isRecurring(ev) {
  return !!ev && !!ev.recurrence_type && ev.recurrence_type !== "none";
}

/** True quando `ev` é uma ocorrência renderizada de uma série (weekView/calendar/expandAcademicEvents), não a linha-base. */
export function isExpandedOccurrence(ev) {
  return !!ev?._isOccurrence;
}

function dayBefore(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function withoutRuleFields(fields) {
  const clean = { ...fields };
  for (const key of RECURRENCE_RULE_KEYS) delete clean[key];
  return clean;
}

/**
 * Aplica uma edição respeitando o escopo escolhido pelo usuário.
 *
 * @param {"events"|"academic_events"} sourceTable
 * @param {object} occurrence  O objeto clicado — ocorrência expandida (tem
 *   `_isOccurrence`/`_baseEventId`) ou a própria linha-base.
 * @param {object} fields      Valores lidos do formulário (inclui as regras
 *   de recorrência quando scope é "future"/"series"; ignoradas se "this").
 * @param {"this"|"future"|"series"} scope
 */
export async function applyEditScope({ sourceTable, occurrence, fields, scope }) {
  const adapter = adapterFor(sourceTable);
  const baseId  = isExpandedOccurrence(occurrence) ? occurrence._baseEventId : occurrence.id;

  // Não-recorrente, ou usuário escolheu "toda a série": edição direta na
  // linha-base — o mesmo caminho de sempre, sem nenhuma exceção envolvida.
  if (!isExpandedOccurrence(occurrence) || scope === SCOPE.SERIES) {
    return adapter.update(baseId, fields);
  }

  const occurrenceDate = occurrence[adapter.dateField];

  if (scope === SCOPE.THIS) {
    await overrideOccurrence(sourceTable, baseId, occurrenceDate, withoutRuleFields(fields));
    return adapter.getById(baseId);
  }

  if (scope === SCOPE.FUTURE) {
    const base = await adapter.getById(baseId);
    if (occurrenceDate > base[adapter.dateField]) {
      // Encerra a série original um dia antes desta ocorrência...
      await adapter.update(baseId, { recurrence_until: dayBefore(occurrenceDate), recurrence_count: null });
    } else {
      // ...a menos que esta SEJA a primeira ocorrência: não sobra nada antes
      // dela, então "esta e as próximas" já significa a série inteira.
      await deleteExceptionsForBase(sourceTable, baseId);
      await adapter.remove(baseId);
    }
    // ...e nasce uma nova série a partir desta data, com os campos editados
    // (a regra de recorrência enviada no formulário é a da nova série).
    return adapter.create({ ...fields, [adapter.dateField]: occurrenceDate, recurrence_parent_id: baseId });
  }

  throw new Error(`recurrenceService.applyEditScope: escopo desconhecido "${scope}"`);
}

/**
 * Aplica uma exclusão respeitando o escopo escolhido pelo usuário. Mesmos
 * parâmetros de applyEditScope(), sem `fields`.
 */
export async function applyDeleteScope({ sourceTable, occurrence, scope }) {
  const adapter = adapterFor(sourceTable);
  const baseId  = isExpandedOccurrence(occurrence) ? occurrence._baseEventId : occurrence.id;

  if (!isExpandedOccurrence(occurrence) || scope === SCOPE.SERIES) {
    await deleteExceptionsForBase(sourceTable, baseId);
    return adapter.remove(baseId);
  }

  const occurrenceDate = occurrence[adapter.dateField];

  if (scope === SCOPE.THIS) {
    return cancelOccurrence(sourceTable, baseId, occurrenceDate);
  }

  if (scope === SCOPE.FUTURE) {
    const base = await adapter.getById(baseId);
    if (occurrenceDate <= base[adapter.dateField]) {
      await deleteExceptionsForBase(sourceTable, baseId);
      return adapter.remove(baseId);
    }
    return adapter.update(baseId, { recurrence_until: dayBefore(occurrenceDate), recurrence_count: null });
  }

  throw new Error(`recurrenceService.applyDeleteScope: escopo desconhecido "${scope}"`);
}
