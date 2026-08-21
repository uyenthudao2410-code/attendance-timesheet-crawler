import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAttendanceFromApiPayloads,
  minutesToHourMetrics,
  normalizeAttendanceApiRecords,
  summarizeAttendanceApiHistory,
} from "../src/api-parser.mjs";

function payload(records, totalNum = records.length) {
  return {
    status: 200,
    endpoint: "https://app.dayscamera.com/next/attendance/record/query/plain",
    body: {
      code: 200,
      msg: "success",
      data: {
        status: 0,
        msg: "",
        records,
        totalNum,
      },
    },
  };
}

test("API parser returns completed morning with evidence and hour metrics", () => {
  const result = extractAttendanceFromApiPayloads([
    payload([
      {
        recordSeq: 102,
        state: 3,
        date: "2026/08/21",
        time: "11:04",
        workingHours: "4.08",
        address: "Site A",
        photoURL: "https://example.invalid/out.jpg",
        lat: "20.8",
        lng: "106.7",
      },
      {
        recordSeq: 101,
        state: 0,
        date: "2026/08/21",
        time: "06:59",
        workingHours: "0",
        address: "Site A",
        photoURL: "https://example.invalid/in.jpg",
        lat: "20.8",
        lng: "106.7",
      },
    ]),
  ], "2026-08-21");

  assert.equal(result.data_source, "attendance_api");
  assert.equal(result.morning.in, "06:59");
  assert.equal(result.morning.out, "11:04");
  assert.equal(result.morning.minutes, 245);
  assert.equal(result.morning.hours_display, "4h05");
  assert.equal(result.morning.hours_decimal, 4.08);
  assert.equal(result.hours_display, "4h05");
  assert.equal(result.hours_decimal, 4.08);
  assert.equal(result.morning.duration_consistency, "aligned");
  assert.equal(result.validation.trusted_for_reporting, true);
  assert.equal(result.morning.evidence.in_record_seq, 101);
  assert.equal(result.morning.evidence.out_record_seq, 102);
  assert.equal(result.morning.evidence.in_photo_present, true);
  assert.equal(result.morning.evidence.out_photo_present, true);
});

test("minute totals convert to both hhmm-style and decimal H", () => {
  assert.deepEqual(minutesToHourMetrics(263), {
    hours_decimal: 4.38,
    hours_display: "4h23",
  });
  assert.deepEqual(minutesToHourMetrics(null), {
    hours_decimal: null,
    hours_display: null,
  });
});

test("API parser deduplicates repeated payloads by recordSeq", () => {
  const records = [
    { recordSeq: 202, state: 3, date: "2026/08/21", time: "11:47", workingHours: "4.37" },
    { recordSeq: 201, state: 0, date: "2026/08/21", time: "07:24", workingHours: "0" },
  ];
  const normalized = normalizeAttendanceApiRecords([payload(records), payload(records)], "2026-08-21");
  assert.equal(normalized.length, 2);
});

test("history summary distinguishes old history from no target-date record", () => {
  const result = summarizeAttendanceApiHistory([
    payload([
      { recordSeq: 402, state: 3, date: "2026/08/07", time: "11:37", workingHours: "4.2" },
      { recordSeq: 401, state: 0, date: "2026/08/07", time: "07:23", workingHours: "0" },
      { recordSeq: 302, state: 3, date: "2026/08/06", time: "17:47", workingHours: "4.4" },
    ], 87),
  ], "2026-08-21");
  assert.equal(result.history_record_count, 3);
  assert.equal(result.api_total_available_records, 87);
  assert.equal(result.latest_record_date, "2026-08-07");
  assert.equal(result.earliest_record_date, "2026-08-06");
  assert.equal(result.target_date_present, false);
});

test("duration mismatch is fail-closed for reporting", () => {
  const result = extractAttendanceFromApiPayloads([
    payload([
      { recordSeq: 302, state: 3, date: "2026/08/21", time: "11:00", workingHours: "1.00" },
      { recordSeq: 301, state: 0, date: "2026/08/21", time: "07:00", workingHours: "0" },
    ]),
  ], "2026-08-21");

  assert.equal(result.morning.in, "07:00");
  assert.equal(result.morning.out, "11:00");
  assert.equal(result.morning.duration_consistency, "mismatch");
  assert.equal(result.status, "review_required");
  assert.equal(result.total_minutes, null);
  assert.equal(result.hours_decimal, null);
  assert.equal(result.hours_display, null);
  assert.equal(result.validation.duration_mismatch_count, 1);
  assert.equal(result.validation.trusted_for_reporting, false);
});

test("valid API with no target-date records remains date_not_found", () => {
  const result = extractAttendanceFromApiPayloads([
    payload([
      { recordSeq: 1, state: 0, date: "2026/08/20", time: "07:00", workingHours: "0" },
    ], 50),
  ], "2026-08-21");
  assert.equal(result.data_source, "attendance_api");
  assert.equal(result.status, "date_not_found");
  assert.equal(result.api_record_count, 0);
  assert.equal(result.api_total_available_records, 50);
});

test("invalid API envelope returns null so DOM can be fallback", () => {
  const result = extractAttendanceFromApiPayloads([{ status: 500, body: {} }], "2026-08-21");
  assert.equal(result, null);
});
