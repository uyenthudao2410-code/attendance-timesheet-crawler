import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSessionsFromTableRecords,
  decimalHoursToMinutes,
  extractAttendance,
  minutesBetween,
  parseTableRecords,
  selectDateScope,
} from "../src/parser.mjs";

test("minutesBetween calculates minute precision", () => {
  assert.equal(minutesBetween("07:23", "11:37"), 254);
  assert.equal(minutesBetween("13:25", "18:04"), 279);
});

test("decimal app working-hours are converted to minutes", () => {
  assert.equal(decimalHoursToMinutes(4.08), 245);
  assert.equal(decimalHoursToMinutes(4.2), 252);
});

test("open morning punch is not fabricated into a clock-out", () => {
  const pageText = `
Timemark: Bảng Chấm Công Của Tôi
Vào ca 07:24 2026/08/21 Thứ sáu
20.998962,
105.937710
Khu vực công trường
--
Tan ca 22:11 2026/08/20 Thứ năm
20.998000,
105.938000
Khu vực công trường
14.97
`;
  const result = extractAttendance(pageText, "2026-08-21");
  assert.equal(result.date_scope_match, "table_row_date");
  assert.equal(result.morning.in, "07:24");
  assert.equal(result.morning.out, null);
  assert.equal(result.afternoon, null);
  assert.equal(result.total_minutes, null);
  assert.equal(result.status, "incomplete");
});

test("completed morning uses per-row working-hours evidence", () => {
  const pageText = `
Tan ca 11:04 2026/08/21 Thứ sáu
20.800000,
106.740000
Khu vực công trường
4.08
Vào ca 06:59 2026/08/21 Thứ sáu
20.800000,
106.740000
Khu vực công trường
--
`;
  const result = extractAttendance(pageText, "2026-08-21");
  assert.equal(result.morning.in, "06:59");
  assert.equal(result.morning.out, "11:04");
  assert.equal(result.morning.minutes, 245);
  assert.equal(result.morning.app_minutes, 245);
  assert.equal(result.morning.app_delta_minutes, 0);
});

test("morning can clock out after noon without becoming an afternoon session", () => {
  const pageText = `
Tan ca 19:21 2026/08/20 Thứ năm
20.900000,
105.850000
Văn phòng
5.9
Vào ca 13:29 2026/08/20 Thứ năm
20.900000,
105.850000
Văn phòng
--
Tan ca 12:16 2026/08/20 Thứ năm
20.900000,
105.850000
Văn phòng
4
Vào ca 08:15 2026/08/20 Thứ năm
20.900000,
105.850000
Văn phòng
--
`;
  const result = extractAttendance(pageText, "2026-08-20");
  assert.deepEqual(
    { in: result.morning.in, out: result.morning.out, minutes: result.morning.minutes },
    { in: "08:15", out: "12:16", minutes: 241 },
  );
  assert.deepEqual(
    { in: result.afternoon.in, out: result.afternoon.out, minutes: result.afternoon.minutes },
    { in: "13:29", out: "19:21", minutes: 352 },
  );
  assert.equal(result.total_minutes, 593);
  assert.equal(result.status, "complete");
});

test("duplicate and noisy punches use app duration to select the correct pair", () => {
  const pageText = `
Time Out 17:17 2026/08/18 Tuesday
20.800000,
106.740000
Site
2.9
Time In 15:28 2026/08/18 Tuesday
20.800000,
106.740000
--
Time In 14:23 2026/08/18 Tuesday
20.800000,
106.740000
Site
--
Time In 14:23 2026/08/18 Tuesday
20.800000,
106.740000
--
Time Out 11:13 2026/08/18 Tuesday
20.800000,
106.740000
Site
3.93
Time In 11:12 2026/08/18 Tuesday
20.800000,
106.740000
--
Time In 07:16 2026/08/18 Tuesday
20.800000,
106.740000
Site
--
Time Out 07:16 2026/08/18 Tuesday
20.800000,
106.740000
Site
0
Time In 07:16 2026/08/18 Tuesday
20.800000,
106.740000
Site
--
`;
  const records = parseTableRecords(pageText, "2026-08-18");
  const sessions = buildSessionsFromTableRecords(records);
  const result = extractAttendance(pageText, "2026-08-18");

  assert.deepEqual(
    { in: result.morning.in, out: result.morning.out, minutes: result.morning.minutes },
    { in: "07:16", out: "11:13", minutes: 237 },
  );
  assert.deepEqual(
    { in: result.afternoon.in, out: result.afternoon.out, minutes: result.afternoon.minutes },
    { in: "14:23", out: "17:17", minutes: 174 },
  );
  assert.ok(sessions.every((session) => !(session.in === "07:16" && session.out === "07:16")));
});

test("English table keeps completed morning and open afternoon", () => {
  const pageText = `
Time In 13:25 2026/08/07 Friday
21.020000,
105.820000
Office
--
Time Out 11:37 2026/08/07 Friday
21.020000,
105.820000
Office
4.2
Time In 07:23 2026/08/07 Friday
21.020000,
105.820000
Office
--
`;
  const result = extractAttendance(pageText, "2026-08-07");
  assert.equal(result.morning.in, "07:23");
  assert.equal(result.morning.out, "11:37");
  assert.equal(result.afternoon.in, "13:25");
  assert.equal(result.afternoon.out, null);
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
  assert.equal(result.morning.in, "07:23");
  assert.equal(result.morning.out, "11:37");
  assert.equal(result.morning.minutes, 254);
  assert.equal(result.afternoon.in, "13:25");
  assert.equal(result.afternoon.out, null);
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
