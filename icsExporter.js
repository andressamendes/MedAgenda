// ICS (.ics) file exporter for academic calendar

const PROD_ID = "-//MedAgenda//MedAgenda 1.0//PT";

function foldLine(line) {
  // RFC 5545 §3.1: lines MUST NOT exceed 75 octets; fold with CRLF + space
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line + "\r\n";

  const chunks = [];
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    const limit = first ? 75 : 74; // first line: 75, continuation: 74 + leading space
    let end = start + limit;
    if (end > bytes.length) end = bytes.length;
    chunks.push((first ? "" : " ") + new TextDecoder().decode(bytes.slice(start, end)));
    start = end;
    first = false;
  }
  return chunks.join("\r\n") + "\r\n";
}

function escapeValue(val) {
  if (!val) return "";
  return String(val)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toICSDate(isoDate) {
  // "2026-09-01" → "20260901"
  return isoDate.replace(/-/g, "");
}

function uid(event) {
  return `${event.id || Math.random().toString(36).slice(2)}@medagenda`;
}

function now() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Generates ICS content for an academic calendar and its events.
 *
 * @param {{ name: string, university?: string }} calendar
 * @param {object[]} events - Array of academic_events records
 * @returns {string} ICS file content
 */
export function exportToICS(calendar, events) {
  const lines = [];

  lines.push("BEGIN:VCALENDAR\r\n");
  lines.push(`VERSION:2.0\r\n`);
  lines.push(foldLine(`PRODID:${PROD_ID}`));
  lines.push(`CALSCALE:GREGORIAN\r\n`);
  lines.push(`METHOD:PUBLISH\r\n`);
  lines.push(foldLine(`X-WR-CALNAME:${escapeValue(calendar.name)}`));
  if (calendar.university) {
    lines.push(foldLine(`X-WR-CALDESC:${escapeValue(calendar.university)}`));
  }

  const stamp = now();

  for (const ev of events) {
    lines.push("BEGIN:VEVENT\r\n");
    lines.push(foldLine(`UID:${uid(ev)}`));
    lines.push(`DTSTAMP:${stamp}Z\r\n`);

    if (ev.all_day !== false) {
      // All-day event: DTSTART and DTEND use DATE value
      lines.push(`DTSTART;VALUE=DATE:${toICSDate(ev.start_date)}\r\n`);
      // DTEND is exclusive: day after last day
      const endDate = ev.end_date || ev.start_date;
      const d = new Date(endDate + "T12:00:00");
      d.setDate(d.getDate() + 1);
      const exclusiveEnd = d.toISOString().slice(0, 10).replace(/-/g, "");
      lines.push(`DTEND;VALUE=DATE:${exclusiveEnd}\r\n`);
    } else {
      lines.push(`DTSTART:${toICSDate(ev.start_date)}T000000\r\n`);
      const endDate = ev.end_date || ev.start_date;
      lines.push(`DTEND:${toICSDate(endDate)}T235959\r\n`);
    }

    lines.push(foldLine(`SUMMARY:${escapeValue(ev.title)}`));

    if (ev.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeValue(ev.description)}`));
    }
    if (ev.location) {
      lines.push(foldLine(`LOCATION:${escapeValue(ev.location)}`));
    }
    if (ev.category) {
      lines.push(foldLine(`CATEGORIES:${escapeValue(ev.category)}`));
    }
    if (ev.color) {
      lines.push(foldLine(`COLOR:${ev.color}`));
    }

    lines.push("END:VEVENT\r\n");
  }

  lines.push("END:VCALENDAR\r\n");
  return lines.join("");
}

/**
 * Triggers a browser download of the ICS file.
 *
 * @param {string} content - ICS file content
 * @param {string} filename - Suggested file name (without extension)
 */
export function downloadICS(content, filename) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${filename.replace(/[^\w\s-]/g, "").trim() || "calendario"}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
