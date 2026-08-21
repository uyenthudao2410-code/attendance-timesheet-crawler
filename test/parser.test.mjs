import test from "node:test";
import assert from "node:assert/strict";
import { extractAttendance, minutesBetween, parseTableRecords, selectDateScope } from "../src/parser.mjs";

test("minutesBetween calculates minute precision", () => {
  assert.equal(minutesBetween("07:23", "11:37"), 254);
  assert.equal(minutesBetween("13:25", "18:04"), 279);
});

test("parser reads live YYYY/MM/DD table row with an open morning session", () => {
  const pageText = `
Timemark: Bảng Chấm Công Của Tôi
Vào ca 07:24 2026/08/21 Thứ sáu
20.998962, 105.93771
Hà Nội
--
Tan ca 22:11 2026/08/20 Thứ năm
`;
  const result = extractAttendance(pageText, "2026-08-21");
  assert.equal(result.date_scope_found, true);
  assert.equal(result.date_scope_match, "table_row_date");
  assert.deepEqual(result.morning, {
    in: "07:24",
    out: null,
    minutes: null,
    source: "table_records",
  });
  assert.equal(result.afternoon, null);
  assert.equal(result.status, "incomplete");
});

test("parser pairs live morning and afternoon table rows", () => {
  const pageText = `
Tan ca 19:21 2026/08/20 Thứ năm
Vào ca 13:29 2026/08/20 Thứ năm
Tan ca 12:16 2026/08/20 Thứ năm
Vào ca 08:15 2026/08/20 Thứ năm
`;
  const result = extractAttendance(pageText, "2026-08-20");
  assert.deepEqual(result.morning, {
    in: "08:15",
    out: "12:16",
    minutes: 241,
    source: "table_records",
  });
  assert.deepEqual(result.afternoon, {
    in: "13:29",
    out: "19:21",
    minutes: 352,
    source: "table_records",
  });
  assert.equal(result.total_minutes, 593);
  assert.equal(result.status, "complete");
});

test("table parser ignores duplicates and uses earliest in/latest out envelope", () => {
  const pageText = `
Time Out 17:17 2026/08/18 Tuesday
Time In 15:28 2026/08/18 Tuesday
Time In 14:23 2026/08/18 Tuesday
Time In 14:23 2026/08/18 Tuesday
Time Out 11:13 2026/08/18 Tuesday
Time In 11:12 2026/08/18 Tuesday
Time In 07:16 2026/08/18 Tuesday
Time Out 07:16 2026/08/18 Tuesday
Time In 07:16 2026/08/18 Tuesday
`;
  const records = parseTableRecords(pageText, "2026-08-18");
  assert.equal(records.length, 7);
  const result = extractAttendance(pageText, "2026-08-18");
  assert.equal(result.morning.in, "07:16");
  assert.equal(result.morning.out, "11:13");
  assert.equal(result.morning.minutes, 237);
  assert.equal(result.afternoon.in, "14:23");
  assert.equal(result.afternoon.out, "17:17");
  assert.equal(result.afternoon.minutes, 174);
});

test("legacy card parser still prefers app-displayed working interval", () => {
  const pageText = `
Timemark: My Timesheet
08/08/2026
Vào ca 07:15
Tan ca 11:20
Đang làm việc 07:15 - 11:20
07/08/2026
Vào ca 13:25
Tan ca 11:37
Đang làm việc 07:23 - 11:37
Làm việc 4g 13p
Vào ca 07:23
Địa chỉ: Hà Nội
06/08/2026
Vào ca 07:10
Tan ca 11:30
`;
  const result = extractAttendance(pageText, "2026-08-07");
  assert.equal(result.date_scope_found, true);
  assert.deepEqual(result.morning, {
    in: "07:23",
    out: "11:37",
    minutes: 254,
    source: "app_interval",
  });
  assert.equal(result.afternoon.in, "13:25");
  assert.equal(result.afternoon.out, null);
  assert.equal(result.status, "incomplete");
});

test("parser fails closed when requested date is absent", () => {
  const result = extractAttendance("Time In 07:23 2026/08/07", "2026-08-21");
  assert.equal(result.status, "date_not_found");
  assert.equal(result.total_minutes, null);
  assert.deepEqual(result.missing, []);
});

test("today label is accepted only when explicitly allowed", () => {
  const text = "Hôm nay\nVào ca 07:00\nTan ca 11:30";
  assert.equal(selectDateScope(text, "2026-08-21").found, false);
  assert.equal(selectDateScope(text, "2026-08-21", { allowTodayLabel: true }).matched_by, "today_label");
});
