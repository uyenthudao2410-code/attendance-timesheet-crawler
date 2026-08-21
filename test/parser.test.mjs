import test from "node:test";
import assert from "node:assert/strict";
import { extractAttendance, minutesBetween, selectDateScope } from "../src/parser.mjs";

test("minutesBetween calculates minute precision", () => {
  assert.equal(minutesBetween("07:23", "11:37"), 254);
  assert.equal(minutesBetween("13:25", "18:04"), 279);
});

test("parser prefers app-displayed working interval and detects missing afternoon out", () => {
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
  assert.ok(result.missing.includes("afternoon_out"));
});

test("parser fails closed when requested date is absent", () => {
  const result = extractAttendance("07/08/2026\nVào ca 07:23\nTan ca 11:37", "2026-08-21");
  assert.equal(result.status, "date_not_found");
  assert.equal(result.total_minutes, null);
  assert.deepEqual(result.missing, []);
});

test("today label is accepted only when explicitly allowed", () => {
  const text = "Hôm nay\nVào ca 07:00\nTan ca 11:30";
  assert.equal(selectDateScope(text, "2026-08-21").found, false);
  assert.equal(selectDateScope(text, "2026-08-21", { allowTodayLabel: true }).matched_by, "today_label");
});
