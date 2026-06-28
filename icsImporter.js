// ICS (.ics) file parser for academic calendar import

function unfoldLines(raw) {
  // Normalize line endings, then join folded lines (RFC 5545 §3.1)
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "");
}

function unescapeValue(val) {
  return val
    .replace(/\\n/g, "\n")
    .replace(/\\N/g, "\n")
    .replace(/\\;/g, ";")
    .replace(/\\,/g, ",")
    .replace(/\\\\/g, "\\");
}

function parseISODate(val) {
  // Handles: 20260901, 20260901T000000, 20260901T000000Z, 20260901T000000+03:00
  const datePart = val.replace(/[TZ].*$/, "").slice(0, 8);
  if (datePart.length !== 8) return null;
  return `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`;
}

function isDateOnly(val) {
  return !val.includes("T");
}

function subtractOneDay(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Parses ICS file content and returns an array of event objects
 * ready to be inserted as academic_events records.
 *
 * @param {string} content - Raw ICS file content
 * @returns {{ title, description, start_date, end_date, all_day, category, location, color }[]}
 */
export function parseICS(content) {
  const lines  = unfoldLines(content).split("\n");
  const events = [];
  let current  = null;

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;

    const rawProp = line.slice(0, colonIdx);
    const rawVal  = line.slice(colonIdx + 1);

    // Property name is before any ';' parameter separator
    const propName = rawProp.split(";")[0].toUpperCase().trim();

    if (propName === "BEGIN" && rawVal.trim() === "VEVENT") {
      current = { all_day: true };
      continue;
    }
    if (propName === "END" && rawVal.trim() === "VEVENT") {
      if (current?.title && current?.start_date) {
        // Normalize: if end_date equals start_date, drop it
        if (current.end_date === current.start_date) delete current.end_date;
        events.push(current);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const val = rawVal.trim();

    switch (propName) {
      case "SUMMARY":
        current.title = unescapeValue(val);
        break;

      case "DESCRIPTION":
        current.description = unescapeValue(val) || null;
        break;

      case "LOCATION":
        current.location = unescapeValue(val) || null;
        break;

      case "CATEGORIES":
        // Take the first category if multiple are listed
        current.category = val.split(",")[0].trim() || null;
        break;

      case "DTSTART": {
        const parsed = parseISODate(val);
        if (parsed) {
          current.start_date = parsed;
          if (!isDateOnly(val)) current.all_day = false;
        }
        break;
      }

      case "DTEND": {
        const parsed = parseISODate(val);
        if (parsed) {
          // DATE-only DTEND is exclusive (day after last day) per RFC 5545
          current.end_date = isDateOnly(val) ? subtractOneDay(parsed) : parsed;
        }
        break;
      }

      case "COLOR":
      case "X-APPLE-CALENDAR-COLOR":
        if (/^#[0-9a-fA-F]{3,8}$/.test(val)) current.color = val;
        break;

      default:
        break;
    }
  }

  return events;
}

/**
 * De-duplicates parsed events against existing events.
 * Two events are considered duplicates if they share the same title and start_date.
 *
 * @param {object[]} incoming  - Events from the ICS file
 * @param {object[]} existing  - Events already in the database
 * @returns {{ unique: object[], duplicates: number }}
 */
export function deduplicateEvents(incoming, existing) {
  const seen = new Set(existing.map(e => `${e.title}|${e.start_date}`));
  const unique     = [];
  let   duplicates = 0;

  for (const ev of incoming) {
    const key = `${ev.title}|${ev.start_date}`;
    if (seen.has(key)) {
      duplicates++;
    } else {
      seen.add(key);
      unique.push(ev);
    }
  }

  return { unique, duplicates };
}
