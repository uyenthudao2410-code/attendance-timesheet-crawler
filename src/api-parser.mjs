import { extractAttendance } from "./parser.mjs";

function validApiEnvelope(payload) {
  const body = payload?.body;
  return (
    payload?.status === 200 &&
    body?.code === 200 &&
    body?.data?.status === 0 &&
    Array.isArray(body?.data?.records)
  );
}

function normalizeApiState(state) {
  if (Number(state) === 0) return "in";
  if (Number(state) === 3) return "out";
  return null;
}

function normalizeApiDate(value) {
  const match = String(value || "").match(/^(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return null;
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
}

function normalizeApiRecord(raw) {
  const state = normalizeApiState(raw?.state);
  const date = normalizeApiDate(raw?.date);
  const time = typeof raw?.time === "string" ? raw.time.trim() : "";
  if (!state || !date || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) return null;

  const recordSeq = Number(raw?.recordSeq);
  const workingHours = Number(raw?.workingHours);
  return {
    state,
    date,
    time,
    record_seq: Number.isFinite(recordSeq) ? recordSeq : null,
    working_hours: Number.isFinite(workingHours) && workingHours >= 0 ? workingHours : null,
    address: typeof raw?.address === "string" ? raw.address : null,
    photo_url: typeof raw?.photoURL === "string" ? raw.photoURL : null,
    lat: Number.isFinite(Number(raw?.lat)) ? Number(raw.lat) : null,
    lng: Number.isFinite(Number(raw?.lng)) ? Number(raw.lng) : null,
  };
}

export function normalizeAttendanceApiRecords(payloads, isoDate) {
  const seen = new Set();
  const records = [];

  for (const payload of Array.isArray(payloads) ? payloads : []) {
    if (!validApiEnvelope(payload)) continue;
    for (const raw of payload.body.data.records) {
      const record = normalizeApiRecord(raw);
      if (!record || record.date !== isoDate) continue;
      const key = record.record_seq != null
        ? `seq:${record.record_seq}`
        : `${record.state}|${record.time}|${record.date}|${record.lat}|${record.lng}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push(record);
    }
  }

  return records.sort((a, b) => (b.record_seq ?? 0) - (a.record_seq ?? 0));
}

function apiRecordsAsTimesheetText(records) {
  return records
    .map((record) => {
      const state = record.state === "in" ? "Time In" : "Time Out";
      const date = record.date.replaceAll("-", "/");
      const location = record.address || "--";
      const hours = record.state === "out" && record.working_hours != null
        ? String(record.working_hours)
        : "--";
      return `${state} ${record.time} ${date}\n${record.lat ?? "--"},\n${record.lng ?? "--"}\n${location}\n${hours}`;
    })
    .join("\n");
}

function bestEvidenceRecord(records, state, time) {
  const candidates = records.filter((record) => record.state === state && record.time === time);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => {
    const score = (record) =>
      (record.address && record.address !== "--" ? 4 : 0) +
      (record.photo_url ? 2 : 0) +
      (record.lat != null && record.lng != null ? 1 : 0);
    return score(b) - score(a) || (b.record_seq ?? 0) - (a.record_seq ?? 0);
  })[0];
}

function attachEvidence(session, records) {
  if (!session) return null;
  const input = session.in ? bestEvidenceRecord(records, "in", session.in) : null;
  const output = session.out ? bestEvidenceRecord(records, "out", session.out) : null;
  return {
    ...session,
    evidence: {
      in_record_seq: input?.record_seq ?? null,
      out_record_seq: output?.record_seq ?? null,
      in_address: input?.address ?? null,
      out_address: output?.address ?? null,
      in_photo_url: input?.photo_url ?? null,
      out_photo_url: output?.photo_url ?? null,
      in_lat: input?.lat ?? null,
      in_lng: input?.lng ?? null,
      out_lat: output?.lat ?? null,
      out_lng: output?.lng ?? null,
      in_photo_present: Boolean(input?.photo_url),
      out_photo_present: Boolean(output?.photo_url),
    },
  };
}

export function extractAttendanceFromApiPayloads(payloads, isoDate) {
  const validPayloads = (Array.isArray(payloads) ? payloads : []).filter(validApiEnvelope);
  if (!validPayloads.length) return null;

  const records = normalizeAttendanceApiRecords(validPayloads, isoDate);
  const parsed = extractAttendance(apiRecordsAsTimesheetText(records), isoDate);
  const totalAvailableRecords = Math.max(
    0,
    ...validPayloads.map((payload) => Number(payload?.body?.data?.totalNum) || 0),
  );

  return {
    ...parsed,
    morning: attachEvidence(parsed.morning, records),
    afternoon: attachEvidence(parsed.afternoon, records),
    data_source: "attendance_api",
    api_payload_count: validPayloads.length,
    api_record_count: records.length,
    api_total_available_records: totalAvailableRecords,
  };
}
