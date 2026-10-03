import fs from "node:fs";

const TZ = "Asia/Ho_Chi_Minh";
const SPEC_PATH = new URL("../config/attendance-ai-visual-spec.json", import.meta.url);

function loadSpec() {
  return JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));
}

function fmtMinutes(minutes) {
  if (!Number.isInteger(minutes) || minutes < 0) return "—";
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

function minuteOfDay(value) {
  const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function period(session) {
  const anchor = minuteOfDay(session?.in || session?.out);
  if (anchor == null) return "unknown";
  return anchor < 12 * 60 + 45 ? "morning" : "afternoon";
}

function sessionCell(sessions) {
  if (!Array.isArray(sessions) || !sessions.length) return "—";
  return sessions.map((session) => {
    const pair = `${session?.in || "—"}–${session?.out || "—"}`;
    const duration = Number.isInteger(session?.minutes) ? ` (${fmtMinutes(session.minutes)})` : "";
    return pair + duration;
  }).join("; ");
}

function displayDate(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Invalid report date");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const names = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
  return `${names[date.getUTCDay()]}, ${match[3]}/${match[2]}/${match[1]}`;
}

function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.at(-1) || "";
}

function canonicalStatusLabel(row, slot, spec) {
  const map = slot === "morning_1230" ? spec.morning_status_labels : spec.daily_status_labels;
  return map[String(row?.status_code || "")] || "Cần đối soát";
}

function buildMorningData(report, spec) {
  const rows = report.employees.map((row) => {
    const minutes = Number.isInteger(row?.morning?.minutes) ? row.morning.minutes : null;
    return {
      name: row.name,
      chart_name: shortName(row.name),
      status_code: row.status_code,
      status: canonicalStatusLabel(row, report.slot, spec),
      check_in: row?.morning?.in || "—",
      check_out: row?.morning?.out || "—",
      minutes,
      duration: fmtMinutes(minutes),
      work_rate_percent: minutes == null ? 0 : Math.max(0, Math.min(100, Math.round(minutes / 240 * 100))),
    };
  });
  const recorded = rows.filter((row) => ["recorded","working"].includes(row.status_code)).length;
  const missing = rows.filter((row) => row.status_code === "not_recorded_morning").length;
  const review = rows.length - recorded - missing;
  const totalMinutes = rows.reduce((sum,row) => sum + (row.minutes || 0), 0);
  return {
    total_employees: rows.length,
    recorded_count: recorded,
    missing_count: missing,
    review_count: review,
    attendance_rate: Math.round(recorded * 100 / Math.max(1, rows.length)),
    total_minutes: totalMinutes,
    total_hours_text: fmtMinutes(totalMinutes),
    employees: rows,
  };
}

function buildDailyData(report, spec) {
  const rows = report.employees.map((row) => {
    const sessions = Array.isArray(row.sessions) ? row.sessions : [];
    const morning = sessions.filter((session) => period(session) === "morning");
    const afternoon = sessions.filter((session) => period(session) === "afternoon");
    return {
      name: row.name,
      chart_name: shortName(row.name),
      status_code: row.status_code,
      status: canonicalStatusLabel(row, report.slot, spec),
      morning_sessions: morning,
      afternoon_sessions: afternoon,
      morning_text: sessionCell(morning),
      afternoon_text: sessionCell(afternoon),
      total_minutes: Number.isInteger(row.total_minutes) ? row.total_minutes : null,
      total_display: Number.isInteger(row.total_minutes) ? fmtMinutes(row.total_minutes) : (row.total_display || "—"),
      ignored_superseded_open_session_count: Number(row.ignored_superseded_open_session_count || 0),
    };
  });
  const withRecord = rows.filter((row) => row.morning_sessions.length || row.afternoon_sessions.length).length;
  const recorded = rows.filter((row) => row.status_code === "recorded").length;
  const open = rows.filter((row) => row.status_code === "open_session").length;
  const noRecord = rows.filter((row) => row.status_code === "not_recorded").length;
  const review = rows.length - recorded - open - noRecord;
  const totalMinutes = rows.reduce((sum,row) => sum + (row.total_minutes || 0), 0);
  return {
    total_employees: rows.length,
    with_record_count: withRecord,
    recorded_count: recorded,
    open_session_count: open,
    no_record_count: noRecord,
    review_count: review,
    attendance_rate: Math.round(withRecord * 100 / Math.max(1, rows.length)),
    total_minutes: totalMinutes,
    total_hours_text: fmtMinutes(totalMinutes),
    employees: rows,
  };
}

function promptHeader(spec, slot) {
  const reportType = slot === "morning_1230" ? "MORNING SHIFT" : "FULL DAY";
  return [
    `Create one premium Vietnamese corporate attendance infographic for ${reportType}.`,
    `Use the approved reference image "${spec.reference_assets[slot]}" as the primary visual reference.`,
    "Re-render the entire infographic from scratch as one unified composition. Do not paste text or data on top of the reference image.",
    "Preserve the approved visual hierarchy, proportions and visual language: premium bright office/city background, large navy title, date card, four KPI cards, chart block, overview/donut block, detail table, and navy/gold footer.",
    "Keep the composition polished, realistic, smooth, visually engaging, mobile-first and sharp on desktop.",
    "Use Vietnamese text.",
    "IMPORTANT DATA RULE: reproduce every supplied employee name, date, time, duration, status and KPI exactly. Never invent or correct values.",
  ];
}

function buildMorningPrompt(request) {
  const d = request.data;
  const rows = d.employees.map((row,index) =>
    `${index+1}. ${row.name} | ${row.status} | vào ${row.check_in} | ra ${row.check_out} | thời lượng ${row.duration} | mức công ${row.work_rate_percent}%`
  );
  return [
    ...promptHeader(request.spec, request.slot),
    "",
    'TITLE: "BÁO CÁO CHẤM CÔNG — CA SÁNG"',
    `DATE: "${request.date_text}"`,
    'SUBTITLE: "Tổng hợp từ hệ thống chấm công để đối soát."',
    "",
    "KPI:",
    `- Tổng nhân sự: ${d.total_employees}`,
    `- Đã chấm công: ${d.recorded_count}`,
    `- Chưa chấm công: ${d.missing_count}`,
    `- Tỷ lệ chấm công: ${d.attendance_rate}%`,
    "",
    'CHART TITLE: "GIỜ CÔNG CA SÁNG THEO NHÂN SỰ"',
    'OVERVIEW TITLE: "TỔNG QUAN CA SÁNG"',
    'TABLE TITLE: "CHI TIẾT CHẤM CÔNG CA SÁNG"',
    "",
    "EMPLOYEES — use exactly:",
    ...rows,
    "",
    'FOOTER: "Lưu ý: Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh."',
    "",
    "OUTPUT: one 1080x1440 vertical PNG. No extra text outside the infographic.",
  ].join("\n");
}

function buildDailyPrompt(request) {
  const d = request.data;
  const rows = d.employees.map((row,index) =>
    `${index+1}. ${row.name} | ca sáng: ${row.morning_text} | ca chiều: ${row.afternoon_text} | tổng công: ${row.total_display} | trạng thái: ${row.status}`
  );
  return [
    ...promptHeader(request.spec, request.slot),
    "",
    'TITLE: "BÁO CÁO CHẤM CÔNG — CẢ NGÀY"',
    `DATE: "${request.date_text}"`,
    'SUBTITLE: "Tổng hợp từ hệ thống chấm công để đối soát."',
    "",
    "KPI:",
    `- Tổng nhân sự: ${d.total_employees}`,
    `- Có chấm công: ${d.with_record_count}`,
    `- Tổng giờ công đã xác nhận: ${d.total_hours_text}`,
    `- Tỷ lệ có bản ghi: ${d.attendance_rate}%`,
    "",
    "OVERVIEW:",
    `- Đã ghi nhận: ${d.recorded_count}`,
    `- Chưa chốt: ${d.open_session_count}`,
    `- Chưa có bản ghi: ${d.no_record_count}`,
    `- Cần đối soát/lỗi nguồn: ${d.review_count}`,
    "",
    'CHART TITLE: "TỔNG GIỜ CÔNG THEO NHÂN SỰ"',
    'OVERVIEW TITLE: "TỔNG QUAN CẢ NGÀY"',
    'TABLE TITLE: "CHI TIẾT CHẤM CÔNG CẢ NGÀY"',
    "",
    "EMPLOYEES — use exactly:",
    ...rows,
    "",
    'FOOTER: "Lưu ý: Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh."',
    "",
    "OUTPUT: one 1080x1440 vertical PNG. No extra text outside the infographic.",
  ].join("\n");
}

export function buildAiVisualRequest(report) {
  const spec = loadSpec();
  if (spec.production_enabled !== false || spec.status !== "test-only") {
    throw new Error("AI visual spec must remain test-only before approval");
  }
  if (!report || report.kind !== "attendance_business_report") throw new Error("Invalid attendance business report");
  if (!["morning_1230","daily_2105"].includes(report.slot)) throw new Error("Unsupported attendance slot");
  if (report.timezone !== TZ) throw new Error("Attendance timezone mismatch");
  if (!Array.isArray(report.employees) || report.employees.length !== 8) throw new Error("AI visual request requires exactly 8 employees");

  const request = {
    schema_version: 1,
    kind: "attendance_ai_visual_request",
    spec_version: spec.version,
    slot: report.slot,
    date: report.date,
    date_text: displayDate(report.date),
    reference_asset: spec.reference_assets[report.slot],
    source_report_generated_at: report.generated_at,
    data: report.slot === "morning_1230" ? buildMorningData(report, spec) : buildDailyData(report, spec),
    spec,
  };
  request.prompt = report.slot === "morning_1230" ? buildMorningPrompt(request) : buildDailyPrompt(request);
  return request;
}

export function validateAiVisualRequest(request, report) {
  if (request?.kind !== "attendance_ai_visual_request") throw new Error("Invalid visual request kind");
  if (request.slot !== report.slot || request.date !== report.date) throw new Error("Visual request identity mismatch");
  if (request.data.total_employees !== 8 || request.data.employees.length !== 8) throw new Error("Visual request roster mismatch");

  const names = request.data.employees.map((row) => row.name);
  if (names.includes("Điều Văn Mạnh")) throw new Error("Incorrect employee spelling: Điều Văn Mạnh");
  if (!names.includes("Điêu Văn Mạnh")) throw new Error("Canonical employee Điêu Văn Mạnh is missing");
  if (new Set(names).size !== 8) throw new Error("Visual request contains duplicate employee names");

  if (request.slot === "daily_2105") {
    const computed = request.data.employees.reduce((sum,row) => sum + (row.total_minutes || 0), 0);
    if (computed !== request.data.total_minutes) throw new Error("Daily total minutes mismatch");
    const recorded = request.data.employees.filter((row) => row.status_code === "recorded").length;
    if (recorded !== request.data.recorded_count) throw new Error("Daily recorded count mismatch");
  } else {
    const recorded = request.data.employees.filter((row) => ["recorded","working"].includes(row.status_code)).length;
    if (recorded !== request.data.recorded_count) throw new Error("Morning recorded count mismatch");
  }

  if (request.prompt.includes("Điều Văn Mạnh")) throw new Error("Prompt contains incorrect employee spelling");
  return true;
}
