import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_LAYOUT_VERSION,
  CANVAS,
  buildAttendanceReportSvg,
} from "../src/attendance-image.mjs";

const NAMES = [
  "Điều Văn Mạnh",
  "Nguyễn Thị Thục Anh",
  "Vũ Đình Tuệ",
  "Bùi Duy Hoàng",
  "Nguyễn Thành Long",
  "Trần Thanh Bình",
  "Lê Thị Phương Linh",
  "Lê Đăng Hiếu",
];

function morningReport() {
  return {
    schema_version: 1,
    kind: "attendance_business_report",
    slot: "morning_1230",
    date: "2026-10-02",
    timezone: "Asia/Ho_Chi_Minh",
    employee_count: 8,
    employees: NAMES.map(function (name, index) {
      if (index === 7) {
        return {
          name,
          morning: null,
          status_code: "not_recorded_morning",
          status_text: "⚠️ Không có bản ghi chấm công ca sáng",
        };
      }
      return {
        name,
        morning: { in: "08:00", out: "12:15", minutes: 255, duration: "4h15" },
        status_code: "recorded",
        status_text: "Đã ghi nhận",
      };
    }),
  };
}

function dailyReport() {
  return {
    schema_version: 1,
    kind: "attendance_business_report",
    slot: "daily_2105",
    date: "2026-10-01",
    timezone: "Asia/Ho_Chi_Minh",
    employee_count: 8,
    employees: NAMES.map(function (name) {
      return {
        name,
        sessions: [
          { in: "08:00", out: "12:00", minutes: 240, duration: "4h00" },
          { in: "13:30", out: "18:30", minutes: 300, duration: "5h00" },
        ],
        total_minutes: 540,
        total_display: "9h00",
        status_code: "recorded",
        status_text: "Đã ghi nhận 2 ca/phiên",
      };
    }),
  };
}

test("approved image layout identity is locked", () => {
  assert.equal(APPROVED_LAYOUT_VERSION, "ATTENDANCE_IMAGE_V1_APPROVED_2026_10_02");
  assert.deepEqual(CANVAS, { width: 1200, height: 1800 });
});

test("morning image uses report data and stays logo-free", () => {
  const svg = buildAttendanceReportSvg(morningReport());
  assert.match(svg, /CHẤM CÔNG CA SÁNG/);
  assert.match(svg, /Thứ Sáu, 02\/10\/2026/);
  assert.match(svg, /Điều Văn Mạnh/);
  assert.match(svg, /Lê Đăng Hiếu/);
  assert.match(svg, /7\/8/);
  assert.match(svg, /88%/);
  assert.match(svg, /Chưa có bản ghi/);
  assert.doesNotMatch(svg, /STACORP/);
  assert.doesNotMatch(svg, /https?:\/\//);
});

test("daily image exposes morning, afternoon and total work clearly", () => {
  const svg = buildAttendanceReportSvg(dailyReport());
  assert.match(svg, /CHẤM CÔNG CẢ NGÀY/);
  assert.match(svg, /Thứ Năm, 01\/10\/2026/);
  assert.match(svg, /CA SÁNG/);
  assert.match(svg, /CA CHIỀU/);
  assert.match(svg, /9h00/);
  assert.match(svg, /72h00/);
  assert.match(svg, /100%/);
  assert.doesNotMatch(svg, /STACORP/);
});

test("image renderer fails closed on a roster other than exactly 8 people", () => {
  const report = morningReport();
  report.employees = report.employees.slice(0, 7);
  assert.throws(() => buildAttendanceReportSvg(report), /exactly 8 employees/);
});
