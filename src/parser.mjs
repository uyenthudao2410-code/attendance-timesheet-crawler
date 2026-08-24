const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
const MIDDAY_SPLIT_MINUTE = 12 * 60 + 45;

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
  return /\b(?:3[01]|[12]\d|0?[1-9])[\/-](?:1[0-2]|0?[1-9])[\/-]20\d{2}\b/.test(line) ||
    /\b20\d{2}[\/-](?:1[0-2]|0?[1-9])[\/-](?:3[01]|[12]\d|0?[1-9])\b/.test(line);
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

  if (start < 0) return { found: false, matched_by: null, text: "", lines: [] };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (looksLikeDateLine(lines[i]) && !variants.some((variant) => lines[i].includes(variant))) {
      end = i;
      break;
    }
  }

  end = Math.min(end, start + 160);
  const scopedLines = lines.slice(start, end);
  return { found: true, matched_by: matchedBy, text: scopedLines.join("\n"), lines: scopedLines };
}

function normalizeState(value) {
  const text = String(value || "").trim();
  if (/^(?:Vào\s*ca|Time\s*In|Clock\s*in|Check\s*in)$/i.test(text)) return "in";
  if (/^(?:Tan\s*ca|Time\s*Out|Clock\s*out|Check\s*out)$/i.test(text)) return "out";
  return null;
}

function parseWorkingHoursFromBlock(block) {
  const lines = String(block || "").split("\n").map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === "--") return null;
    if (/^\d+(?:\.\d+)?$/.test(line)) {
      const value = Number(line);
      if (Number.isFinite(value) && value >= 0 && value <= 24) return value;
    }
  }
  return null;
}

export function decimalHoursToMinutes(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 60);
}

export function parseTableRecords(rawText, isoDate) {
  vietnamDateParts(isoDate);
  const text = String(rawText || "").replace(/\u00a0/g, " ").replace(/\r/g, "");
  const header = /\b(Vào\s*ca|Tan\s*ca|Time\s*In|Time\s*Out|Clock\s*in|Clock\s*out|Check\s*in|Check\s*out)\s+((?:[01]?\d|2[0-3]):[0-5]\d)\s+(20\d{2}[\/-](?:1[0-2]|0?[1-9])[\/-](?:3[01]|[12]\d|0?[1-9])|(?:3[01]|[12]\d|0?[1-9])[\/-](?:1[0-2]|0?[1-9])[\/-]20\d{2})\b/gi;
  const matches = [...text.matchAll(header)];
  const records = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const state = normalizeState(match[1]);
    const time = normalizeTime(match[2]);
    const date = normalizeDateToken(match[3]);
    if (!state || !time || date !== isoDate) continue;
    const blockEnd = matches[index + 1]?.index ?? text.length;
    const block = text.slice(match.index, blockEnd);
    const workingHours = parseWorkingHoursFromBlock(block);
    records.push({
      index,
      state,
      time,
      date,
      working_hours: workingHours,
      app_minutes: decimalHoursToMinutes(workingHours),
      source: "table_row",
    });
  }

  return records;
}

function sessionContains(session, time) {
  if (!session?.in || !session?.out || !time) return false;
  const start = minuteOfDay(session.in);
  const end = minuteOfDay(session.out);
  const value = minuteOfDay(time);
  return start <= value && value <= end;
}

function chooseInputForOutput(records, outIndex, usedInputs) {
  const out = records[outIndex];
  const outMinute = minuteOfDay(out.time);
  const candidates = [];

  for (let index = outIndex + 1; index < records.length; index += 1) {
    const record = records[index];
    if (record.state !== "in" || usedInputs.has(index)) continue;
    const inMinute = minuteOfDay(record.time);
    if (inMinute > outMinute) continue;
    const actualMinutes = minutesBetween(record.time, out.time);
    const expectedMinutes = out.app_minutes;
    const error = Number.isInteger(expectedMinutes) ? Math.abs(actualMinutes - expectedMinutes) : null;
    candidates.push({ index, record, actualMinutes, error, distance: index - outIndex });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.error != null || b.error != null) {
      const ae = a.error ?? Number.POSITIVE_INFINITY;
      const be = b.error ?? Number.POSITIVE_INFINITY;
      if (ae !== be) return ae - be;
    }
    return a.distance - b.distance;
  });
  return candidates[0];
}

export function buildSessionsFromTableRecords(records) {
  const usedInputs = new Set();
  const sessions = [];
  const unmatchedOutputs = [];

  for (let outIndex = 0; outIndex < records.length; outIndex += 1) {
    const out = records[outIndex];
    if (out.state !== "out") continue;
    const candidate = chooseInputForOutput(records, outIndex, usedInputs);
    if (!candidate) {
      unmatchedOutputs.push(out);
      continue;
    }
    usedInputs.add(candidate.index);
    sessions.push({
      in: candidate.record.time,
      out: out.time,
      minutes: candidate.actualMinutes,
      app_minutes: out.app_minutes,
      working_hours: out.working_hours,
      app_delta_minutes: Number.isInteger(out.app_minutes) ? candidate.actualMinutes - out.app_minutes : null,
      source: "table_records",
    });
  }

  const completed = sessions.filter((session, index, all) => {
    if (!Number.isInteger(session.minutes) || session.minutes > 5) return true;
    return !all.some((other, otherIndex) => otherIndex !== index && (other.minutes ?? 0) > session.minutes && sessionContains(other, session.in) && sessionContains(other, session.out));
  });

  const openInputs = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.state !== "in" || usedInputs.has(index)) continue;
    if (completed.some((session) => sessionContains(session, record.time))) continue;
    if (openInputs.some((item) => item.in === record.time)) continue;
    openInputs.push({ in: record.time, out: null, minutes: null, app_minutes: null, working_hours: null, app_delta_minutes: null, source: "table_open_in" });
  }

  const orphanOutputs = [];
  for (const record of unmatchedOutputs) {
    if (completed.some((session) => sessionContains(session, record.time))) continue;
    if (orphanOutputs.some((item) => item.out === record.time)) continue;
    orphanOutputs.push({ in: null, out: record.time, minutes: null, app_minutes: record.app_minutes, working_hours: record.working_hours, app_delta_minutes: null, source: "table_orphan_out" });
  }

  return [...completed, ...openInputs, ...orphanOutputs].sort((a, b) => {
    const aAnchor = minuteOfDay(a.in || a.out) ?? Number.POSITIVE_INFINITY;
    const bAnchor = minuteOfDay(b.in || b.out) ?? Number.POSITIVE_INFINITY;
    return aAnchor - bAnchor;
  });
}

function sessionPeriod(session) {
  const anchor = minuteOfDay(session.in || session.out);
  if (anchor == null) return null;
  return anchor < MIDDAY_SPLIT_MINUTE ? "morning" : "afternoon";
}

function sessionScore(session) {
  if (session.in && session.out) return 100000 + (session.minutes || 0);
  if (session.in) return 1000 + minuteOfDay(session.in);
  if (session.out) return 500 + minuteOfDay(session.out);
  return 0;
}

function choosePeriodSession(sessions, period) {
  const candidates = sessions.filter((session) => sessionPeriod(session) === period);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => sessionScore(b) - sessionScore(a))[0];
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

function chooseLegacySession(intervals, starts, ends, period) {
  const interval = intervals.find((item) => sessionPeriod(item) === period);
  if (interval) return interval;
  const isPeriodStart = (time) => (period === "morning" ? minuteOfDay(time) < MIDDAY_SPLIT_MINUTE : minuteOfDay(time) >= MIDDAY_SPLIT_MINUTE);
  const start = starts.find(isPeriodStart) || null;
  if (!start) return null;
  const startMinute = minuteOfDay(start);
  const endCandidates = ends.filter((time) => minuteOfDay(time) >= startMinute);
  const end = endCandidates[0] || null;
  return { in: start, out: end, minutes: end ? minutesBetween(start, end) : null, source: "separate_marks" };
}

function finalize(morning, afternoon, dateScopeMatch, appReportedMinutes = null, meta = {}) {
  const missing = [];
  if (!morning?.in) missing.push("morning_in");
  if (!morning?.out) missing.push("morning_out");
  if (!afternoon?.in) missing.push("afternoon_in");
  if (!afternoon?.out) missing.push("afternoon_out");
  const sessions = Array.isArray(meta.sessions)
    ? meta.sessions
    : [morning, afternoon].filter(Boolean);
  const minuteParts = sessions
    .filter((session) => session?.in && session?.out && Number.isInteger(session?.minutes))
    .map((session) => session.minutes);
  return {
    date_scope_found: true,
    date_scope_match: dateScopeMatch,
    morning,
    afternoon,
    sessions,
    total_minutes: minuteParts.length ? minuteParts.reduce((sum, value) => sum + value, 0) : null,
    app_reported_minutes: appReportedMinutes,
    missing,
    status: missing.length === 0 ? "complete" : "incomplete",
    ...meta,
  };
}

export function extractAttendance(rawText, isoDate, options = {}) {
  const tableRecords = parseTableRecords(rawText, isoDate);
  if (tableRecords.length) {
    const sessions = buildSessionsFromTableRecords(tableRecords);
    return finalize(
      choosePeriodSession(sessions, "morning"),
      choosePeriodSession(sessions, "afternoon"),
      "table_row_date",
      null,
      { table_record_count: tableRecords.length, table_session_count: sessions.length, sessions },
    );
  }

  const scope = selectDateScope(rawText, isoDate, options);
  if (!scope.found) {
    return {
      date_scope_found: false,
      date_scope_match: null,
      morning: null,
      afternoon: null,
      sessions: [],
      total_minutes: null,
      app_reported_minutes: null,
      missing: [],
      status: "date_not_found",
      table_record_count: 0,
      table_session_count: 0,
    };
  }

  const intervals = pairedIntervals(scope.text);
  const inTimes = labeledTimes(scope.text, "(?:Vào\\s*ca|Time\\s*In|Clock\\s*in|Check\\s*in)");
  const outTimes = labeledTimes(scope.text, "(?:Tan\\s*ca|Time\\s*Out|Clock\\s*out|Check\\s*out)");
  const morning = chooseLegacySession(intervals, inTimes, outTimes, "morning");
  const afternoon = chooseLegacySession(intervals, inTimes, outTimes, "afternoon");
  const sessions = [morning, afternoon].filter(Boolean);
  return finalize(
    morning,
    afternoon,
    scope.matched_by,
    parseDurationMinutes(scope.text),
    { table_record_count: 0, table_session_count: sessions.length, sessions },
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
