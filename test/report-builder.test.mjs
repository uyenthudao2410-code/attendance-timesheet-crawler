import test from "node:test";
import assert from "node:assert/strict";
import { extractAttendance } from "../src/parser.mjs";
import { buildAttendanceBusinessReport } from "../src/report-builder.mjs";

const NAMES = [
  "Điêu Văn Mạnh",
  "Nguyễn Thị Thục Anh",
  "Vũ Đình Tuệ",
  "Bùi Duy Hoàng",
  "Nguyễn Thành Long",
  "Trần Thanh Bình",
  "Lê Thị Phương Linh",
  "Lê Đăng Hiếu",
];

function rawReport(firstEmployee) {
  return {
    schema_version: 5,
    date: "2026-08-24",
    timezone: "Asia/Ho_Chi_Minh",
    generated_at: "2026-08-24T05:15:10.000Z",
    employees: NAMES.map((name, index) => index === 0
      ? { name, access_ok: true, ...firstEmployee }
      : { name, access_ok: true, status: "date_not_found", sessions: [], morning: null, afternoon: null }),
  };
}

test("morning report ignores absent afternoon while an employee is still working", () => {
  const report = buildAttendanceBusinessReport(rawReport({
    status: "incomplete",
    morning: { in: "07:20", out: null, minutes: null },
    afternoon: null,
    sessions: [{ in: "07:20", out: null, minutes: null }],
  }), "morning_1230", NAMES);

  assert.equal(report.employee_count, 8);
  assert.equal(report.employees[0].status_code, "working");
  assert.equal(report.employees[0].status_text, "Đang làm việc");
  assert.equal(report.employees[0].morning.in, "07:20");
  assert.equal(report.employees[0].morning.out, null);
  assert.match(report.teams_html, /Điêu Văn Mạnh/);
  assert.match(report.teams_html, /Đang làm việc/);
});

test("daily report treats one complete cross-midday shift as valid instead of missing afternoon", () => {
  const report = buildAttendanceBusinessReport(rawReport({
    status: "incomplete",
    morning: { in: "08:00", out: "17:00", minutes: 540 },
    afternoon: null,
    sessions: [{ in: "08:00", out: "17:00", minutes: 540 }],
  }), "daily_2105", NAMES);

  assert.equal(report.employees[0].status_code, "recorded");
  assert.equal(report.employees[0].status_text, "Đã ghi nhận 1 ca liên tục");
  assert.equal(report.employees[0].total_minutes, 540);
  assert.equal(report.employees[0].total_display, "9h00");
});

test("parser preserves and totals all valid sessions instead of dropping a third session", () => {
  const pageText = `
Time Out 17:30 2026/08/24 Monday
21.0,
105.8
Site
1
Time In 16:30 2026/08/24 Monday
21.0,
105.8
Site
--
Time Out 15:30 2026/08/24 Monday
21.0,
105.8
Site
1
Time In 14:30 2026/08/24 Monday
21.0,
105.8
Site
--
Time Out 11:00 2026/08/24 Monday
21.0,
105.8
Site
4
Time In 07:00 2026/08/24 Monday
21.0,
105.8
Site
--
`;
  const parsed = extractAttendance(pageText, "2026-08-24");
  assert.equal(parsed.sessions.length, 3);
  assert.equal(parsed.total_minutes, 360);

  const report = buildAttendanceBusinessReport(rawReport({
    ...parsed,
    access_ok: true,
  }), "daily_2105", NAMES);
  assert.equal(report.employees[0].status_code, "recorded");
  assert.equal(report.employees[0].total_minutes, 360);
  assert.equal(report.employees[0].status_text, "Đã ghi nhận 3 ca/phiên");
  assert.match(report.teams_html, /14:30-15:30/);
  assert.match(report.teams_html, /16:30-17:30/);
});

test("daily report never totals across an open session", () => {
  const report = buildAttendanceBusinessReport(rawReport({
    status: "incomplete",
    morning: { in: "07:00", out: "11:00", minutes: 240 },
    afternoon: { in: "13:00", out: null, minutes: null },
    sessions: [
      { in: "07:00", out: "11:00", minutes: 240 },
      { in: "13:00", out: null, minutes: null },
    ],
  }), "daily_2105", NAMES);

  assert.equal(report.employees[0].status_code, "open_session");
  assert.equal(report.employees[0].total_minutes, null);
  assert.equal(report.employees[0].total_display, "Chưa chốt");
  assert.match(report.employees[0].status_text, /thiếu giờ ra sau 13:00/);
});

test("stale date_not_found is source maintenance, never employee no-attendance", () => {
  const report = buildAttendanceBusinessReport(rawReport({
    status: "date_not_found",
    sessions: [],
    morning: null,
    afternoon: null,
    device_history: {
      history_record_count: 202,
      latest_record_date: "2026-08-18",
      earliest_record_date: "2026-07-16",
      target_date_present: false,
      interpretation: "history_exists_but_no_target_date",
    },
  }), "morning_1230", NAMES);

  const row = report.employees[0];
  assert.equal(row.status_code, "source_review");
  assert.equal(row.source_issue_code, "source_history_stale");
  assert.equal(row.source_health.latest_record_date, "2026-08-18");
  assert.match(row.status_text, /lịch sử hiện dừng ở 18\/08\/2026/);
  assert.match(row.status_text, /cập nhật\/đối soát link nguồn/);
  assert.doesNotMatch(row.status_text, /Chưa ghi nhận$/);
  assert.equal(report.quality.source_review_count, 8);
  assert.equal(report.quality.stale_source_count, 1);
});

test("empty source history is explicitly classified as a link/source problem", () => {
  const report = buildAttendanceBusinessReport(rawReport({
    status: "date_not_found",
    sessions: [],
    morning: null,
    afternoon: null,
    device_history: {
      history_record_count: 0,
      latest_record_date: null,
      earliest_record_date: null,
      target_date_present: false,
      interpretation: "device_history_empty",
    },
  }), "morning_1230", NAMES);

  const row = report.employees[0];
  assert.equal(row.status_code, "source_review");
  assert.equal(row.source_issue_code, "source_history_empty");
  assert.match(row.status_text, /không trả lịch sử/);
  assert.match(row.status_text, /link nguồn/);
  assert.equal(report.quality.empty_source_count, 1);
});

test("generic date_not_found still fails closed without inferring absence", () => {
  const report = buildAttendanceBusinessReport(rawReport({
    status: "date_not_found",
    sessions: [],
    morning: null,
    afternoon: null,
    api_total_available_records: 74,
  }), "morning_1230", NAMES);

  assert.equal(report.employees[0].status_code, "source_review");
  assert.equal(report.employees[0].source_issue_code, "source_unresolved");
  assert.equal(report.employees[0].status_text, "⚠️ Nguồn chưa xác nhận được dữ liệu ngày này – cần đối soát nguồn");
  assert.doesNotMatch(report.employees[0].status_text, /Chưa ghi nhận$/);
  assert.match(report.teams_html, /Nguồn chưa xác nhận được dữ liệu ngày này/);
  assert.equal(report.quality.review_required_count, 8);
});

test("daily date_not_found also fails closed as source review", () => {
  const report = buildAttendanceBusinessReport(rawReport({
    status: "date_not_found",
    source_classification: "link_history_stale_needs_verification",
    sessions: [],
    morning: null,
    afternoon: null,
  }), "daily_2105", NAMES);

  assert.equal(report.employees[0].status_code, "source_review");
  assert.equal(report.employees[0].source_issue_code, "source_unresolved");
  assert.equal(report.employees[0].status_text, "⚠️ Nguồn chưa xác nhận được dữ liệu ngày này – cần đối soát nguồn");
});
