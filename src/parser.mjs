const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;

export function normalizeTime(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export function minutesBetween(start, end) {
  const a = normalizeTime(start);
  const b = normalizeTime(end);
  if (!a || !b) return null;
  const [sh, sm] = a.split(":").map(Number);
  const [eh, em] = b.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function minuteOfDay(time) {
  const normalized = normalizeTime(time);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

export function vietnamDateParts(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO date: ${isoDate}`);
  return { year: match[1], month: match[2], day: match[3] };
}

function dateVariants(isoDate) {
  const { year, month, day } = vietnamDateParts(isoDate);
  const d = String(Number(day));
  const m = String(Number(month));
  return [
    `${day}/${month}/${year}`,
    `${d}/${m}/${year}`,
    `${day}-${month}-${year}`,
    `${d}-${m}-${year}`,
    `${year}-${month}-${day}`,
    `${year}/${month}/${day}`,
  ];
}

function normalizeDateToken(value) {
  const token = String(value || "").trim();
  let match = token.match(/^(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (match) {
    return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
  }
  match = token.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})$/);
  if (match) {
    return `${match[3]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
  }
  return null;
}

function looksLikeDateLine(line) {
  return /\b(?:0?[1-9]|[12]\d|3[01])[\/-](?:0?[1-9]|1[0-2])[\/-]20\d{2}\b/.test(line) ||
    /\b20\d{2}[\/-](?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])\b/.test(line);
}

export function selectDateScope(rawText, isoDate, { allowTodayLabel = false } = {}) {
  const text = String(rawText || "").replace(/\u00a0/g, " ").replace(/\r/g, "");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const variants = dateVariants(isoDate);

  let start = lines.findIndex((line) => variants.some((variant) => line.includes(variant)));
  let matchedBy = "date";

  if (start < 0 && allowTodayLabel) {
    start = lines.findIndex((line) => /\b(Hôm nay|Today)\b/i.test(line));
    matchedBy = "today_label";
  }

  if (start < 0) {
    return { found: false, matched_by: null, text: "", lines: [] };
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (looksLikeDateLine(lines[i]) && !variants.some((variant) => lines[i].includes(variant))) {
      end = i;
      break;
    }
  }

  end = Math.min(end, start + 160);
  const scopedLines = lines.slice(Math.max(0, start - 3), end);
  return {
    found: true,
    matched_by: matchedBy,
    text: scopedLines.join("\n"),
    lines: scopedLines,
  };
}

function normalizeState(value) {
  return /^(?:Vào\s*ca|Time\s*In|Clock\s*in|Check\s*in)$/i.test(String(value || "").trim()) ? "in" : "out";
}

export function parseTableRecords(rawText, isoDate) {
  vietnamDateParts(isoDate);
  const text = String(rawText || "").replace(/\u00a0/g, " ").replace(/\r/g, "");
  const dateToken = "(?:20\\d{2}[\\/-](?:0?[1-9]|1[0-2])[\\/-](?:0?[1-9]|[12]\\d|3[01])|(?:0?[1-9]|[12]\\d|3[01])[\\/-](?:0?[1-9]|1[0-2])[\\/-]20\\d{2})";
  const regex = new RegExp(`(?:Vào\\s*ca|Tan\\s*ca|Time\\s*In|Time\\s*Out|Clock\\s*in|Clock\\s*out|Check\\s*in|Check\\s*out)\\s+((?:[01]?\\d|2[0-3]):[0-5]\\d)\\s+(${dateToken})`, "gi");
  const records = [];
  const seen = new Set();

  for (const match of text.matchAll(regex)) {
    const full = match[0];
    const stateMatch = full.match(/^(?:Vào\s*ca|Tan\s*ca|Time\s*In|Time\s*Out|Clock\s*in|Clock\s*out|Check\s*in|Check\s*out)/i);
    const state = normalizeState(stateMatch?.[0]);
    const time = normalizeTime(match[1]);
    const date = normalizeDateToken(match[2]);
    if (!time || date !== isoDate) continue;
    const key = `${state}|${time}|${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({ state, time, date, source: "table_row" });
  }

  return records.sort((a, b) => {
    const diff = minuteOfDay(a.time) - minuteOfDay(b.time);
    if (diff !== 0) return diff;
    return a.state === b.state ? 0 : a.state === "in" ? -1 : 1;
  });
}

function buildPeriod(records, period) {
  const ins = records.filter((record) => record.state === "in");
  const outs = records.filter((record) => record.state === "out");
  const morningIns = ins.filter((record) => minuteOfDay(record.time) < 12 * 60);
  const afternoonIns = ins.filter((record) => minuteOfDay(record.time) >= 12 * 60);
  const morningStart = morningIns[0] || null;
  const afternoonStart = afternoonIns[0] || null;

  if (period === "morning") {
    if (!morningStart) {
      const orphanOuts = outs.filter((record) => minuteOfDay(record.time) < 13 * 60 + 30);
      const out = orphanOuts.at(-1) || null;
      return out ? { in: null, out: out.time, minutes: null, source: "table_records" } : null;
    }
    const upperBound = afternoonStart ? minuteOfDay(afternoonStart.time) : Number.POSITIVE_INFINITY;
    const candidates = outs.filter((record) => {
      const value = minuteOfDay(record.time);
      return value >= minuteOfDay(morningStart.time) && value < upperBound;
    });
    const out = candidates.at(-1) || null;
    return {
      in: morningStart.time,
      out: out?.time || null,
      minutes: out ? minutesBetween(morningStart.time, out.time) : null,
      source: "table_records",
    };
  }

  if (!afternoonStart) {
    const orphanOuts = outs.filter((record) => minuteOfDay(record.time) >= 12 * 60);
    if (morningStart) return null;
    const out = orphanOuts.at(-1) || null;
    return out ? { in: null, out: out.time, minutes: null, source: "table_records" } : null;
  }

  const candidates = outs.filter((record) => minuteOfDay(record.time) >= minuteOfDay(afternoonStart.time));
  const out = candidates.at(-1) || null;
  return {
    in: afternoonStart.time,
    out: out?.time || null,
    minutes: out ? minutesBetween(afternoonStart.time, out.time) : null,
    source: "table_records",
  };
}

function parseDurationMinutes(text) {
  const value = String(text || "");
  const match = value.match(/(?:Làm\s*việc|Working)[^\d]*(\d+)\s*(?:g|giờ|h|hr|hrs)\s*(\d+)?\s*(?:p|phút|min|mins)?/i);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2] || 0);
}

function pairedIntervals(text) {
  const normalized = String(text || "").replace(/[–—→]/g, "-");
  const results = [];
  const labeled = /(?:Đang\s*làm\s*việc|Làm\s*việc|Working)[^\d]{0,30}((?:[01]?\d|2[0-3]):[0-5]\d)\s*-\s*((?:[01]?\d|2[0-3]):[0-5]\d)/gi;
  for (const match of normalized.matchAll(labeled)) {
    const start = normalizeTime(match[1]);
    const end = normalizeTime(match[2]);
    results.push({ in: start, out: end, minutes: minutesBetween(start, end), source: "app_interval" });
  }
  return results;
}

function labeledTimes(text, labelRegex) {
  const regex = new RegExp(`${labelRegex}[^\\d]{0,20}((?:[01]?\\d|2[0-3]):[0-5]\\d)`, "gi");
  const values = [];
  for (const match of String(text || "").matchAll(regex)) {
    const time = normalizeTime(match[1]);
    if (time && !values.includes(time)) values.push(time);
  }
  return values;
}

function chooseSession(intervals, starts, ends, period) {
  const isPeriod = (time) => {
    if (!time) return false;
    const hour = Number(time.split(":")[0]);
    return period === "morning" ? hour < 12 : hour >= 12;
  };
  const paired = intervals.find((item) => isPeriod(item.in));
  if (paired) return paired;
  const start = starts.find(isPeriod) || null;
  const end = ends.find(isPeriod) || null;
  if (!start && !end) return null;
  return { in: start, out: end, minutes: start && end ? minutesBetween(start, end) : null, source: "separate_marks" };
}

function finalize(morning, afternoon, dateScopeMatch, appReportedMinutes = null) {
  const missing = [];
  if (!morning?.in) missing.push("morning_in");
  if (!morning?.out) missing.push("morning_out");
  if (!afternoon?.in) missing.push("afternoon_in");
  if (!afternoon?.out) missing.push("afternoon_out");
  const minuteParts = [morning?.minutes, afternoon?.minutes].filter((value) => Number.isInteger(value));
  return {
    date_scope_found: true,
    date_scope_match: dateScopeMatch,
    morning,
    afternoon,
    total_minutes: minuteParts.length ? minuteParts.reduce((sum, value) => sum + value, 0) : null,
    app_reported_minutes: appReportedMinutes,
    missing,
    status: missing.length === 0 ? "complete" : "incomplete",
  };
}

export function extractAttendance(rawText, isoDate, options = {}) {
  const tableRecords = parseTableRecords(rawText, isoDate);
  if (tableRecords.length) {
    return finalize(buildPeriod(tableRecords, "morning"), buildPeriod(tableRecords, "afternoon"), "table_row_date");
  }

  const scope = selectDateScope(rawText, isoDate, options);
  if (!scope.found) {
    return {
      date_scope_found: false,
      date_scope_match: null,
      morning: null,
      afternoon: null,
      total_minutes: null,
      app_reported_minutes: null,
      missing: [],
      status: "date_not_found",
    };
  }

  const intervals = pairedIntervals(scope.text);
  const inTimes = labeledTimes(scope.text, "(?:Vào\\s*ca|Clock\\s*in|Check\\s*in)");
  const outTimes = labeledTimes(scope.text, "(?:Tan\\s*ca|Clock\\s*out|Check\\s*out)");
  return finalize(
    chooseSession(intervals, inTimes, outTimes, "morning"),
    chooseSession(intervals, inTimes, outTimes, "afternoon"),
    scope.matched_by,
    parseDurationMinutes(scope.text),
  );
}

export function listAllTimes(text) {
  const values = [];
  for (const match of String(text || "").matchAll(TIME_RE)) {
    const value = normalizeTime(match[0]);
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}
