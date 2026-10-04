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

function displayTime(isoTimestamp) {
  const date = new Date(String(isoTimestamp || ""));
  if (!Number.isFinite(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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
    average_minutes: recorded ? Math.round(totalMinutes / recorded) : 0,
    average_hours_text: recorded ? fmtMinutes(Math.round(totalMinutes / recorded)) : "—",
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
    average_minutes: recorded ? Math.round(totalMinutes / recorded) : 0,
    average_hours_text: recorded ? fmtMinutes(Math.round(totalMinutes / recorded)) : "—",
    employees: rows,
  };
}

function promptHeader(spec, slot) {
  const reportType = slot === "morning_1230" ? "CA SÁNG" : "CẢ NGÀY";
  return [
    `Create ONE premium Vietnamese corporate HR attendance infographic for ${reportType}.`,
    "FORMAT LOCK: vertical 1440x1920 PNG, 3:4 ratio, one unified composition, high-resolution and sharp for Microsoft Teams on mobile and desktop.",
    "VISUAL IDENTITY: energetic and premium business style; fresh bright green (#27C86F / #52D985) as the main positive accent, deep corporate navy (#0B2E66), professional blue (#1F6FCE), warm gold (#D9A62E), white/light-blue surfaces, and red (#E5484D) only for missing/error states.",
    "MOOD: optimistic, disciplined, motivating, confident, modern, highly professional. Do not look playful, childish, neon, cluttered, or like a generic web dashboard screenshot.",
    "HEADER ART DIRECTION: premium bright modern office scene with natural daylight, glass partitions, subtle city-office depth, fresh green plants and refined desk elements. The office imagery should create energy and business depth but stay secondary to the data. No people faces, no company logo, no brand mark, no tagline, no slogan.",
    "TYPOGRAPHY: modern premium sans-serif, strong hierarchy, crisp Vietnamese diacritics, large readable numbers, no warped letters. If a line is long, reduce font size or wrap cleanly; NEVER omit, paraphrase, or invent text.",
    "FIXED INFORMATION ORDER: 1) header/title/date/update time, 2) four KPI cards, 3) full-width confirmed-hours summary strip, 4) chart + overview panel, 5) detailed 8-row table, 6) footer note.",
    "LAYOUT: generous white space, rounded premium cards, subtle depth/shadows, consistent spacing, no overlapping blocks, no cropped text, no tiny unreadable labels.",
    "DATA FIDELITY IS ABSOLUTE: copy every supplied employee name, Vietnamese accent, date, time, duration, status and KPI EXACTLY. Never calculate new values, never correct values, never infer a missing time, never fabricate attendance data.",
    "MISSING DATA RULE: render missing values exactly as '—'. Do not guess. Missing/error rows must remain visually distinct using warm red; review/open-session rows use amber/gold; confirmed rows use fresh green.",
    "ROW LOCK: show all 8 employees exactly once, in the supplied order. Never duplicate, omit, rename, reorder, or merge rows.",
    "CHART LOCK: chart values must visually correspond to the supplied duration values. Missing rows must not receive a positive bar.",
    "BRANDING LOCK: ABSOLUTELY NO LOGO, NO COMPANY NAME MARK, NO TAGLINE, NO SLOGAN. Use neutral HR/business icons plus tasteful office/plant imagery only.",
    `PROMPT SPEC VERSION: ${spec.version}`,
  ];
}

function chartHours(minutes) {
  if (!Number.isInteger(minutes) || minutes <= 0) return "0.0h";
  return `${(minutes / 60).toFixed(1)}h`;
}

function buildMorningPrompt(request) {
  const d = request.data;
  const attention = d.missing_count + d.review_count;
  const rows = d.employees;
  const tableRows = rows.map((row, index) =>
    `${index + 1}. ${row.name} | trạng thái: ${row.status} | giờ vào: ${row.check_in} | giờ ra: ${row.check_out} | thời lượng: ${row.duration} | mức công: ${row.work_rate_percent}%`
  );

  return [
    "Create exactly ONE Vietnamese HR attendance infographic for MORNING ATTENDANCE using APPROVED MORNING MOBILE V9 STRICT DATA.",
    "The highest priority is DATA ACCURACY. Slight layout variation is allowed whenever it improves readability or data fidelity.",
    "",
    "MOBILE-FIRST OUTPUT:",
    "- Portrait image optimized primarily for phone viewing in Microsoft Teams.",
    "- Preferred aspect: 2:3 to 9:16 portrait. Preferred generation size 1024x1536 or equivalent mobile portrait.",
    "- Large readable typography, large KPI numbers, clear row spacing, strong hierarchy, no tiny text.",
    "- One report only, one image only.",
    "- Use direct ChatGPT Image output only.",
    "",
    "SCOPE LOCK:",
    "- This image is ONLY the MORNING attendance report.",
    "- Never include FULL-DAY attendance.",
    "- Never include a second report, second page, duplicate dashboard, or extra report block.",
    "",
    "VISUAL STYLE:",
    "- Premium modern HR/business infographic; bright, fresh and professional.",
    "- fresh bright green as main positive accent; combine with white/light neutral surfaces, deep navy/professional blue, restrained gold, and red/orange only for missing or attention states.",
    "- A subtle bright office / greenery header visual is allowed, but it must stay secondary to the data.",
    "- Rounded cards, generous white space, simple clean composition, crisp Vietnamese typography.",
    "- Do not force a dense desktop dashboard. Prefer a simple vertical reading flow.",
    "",
    "BRANDING LOCK:",
    "- ABSOLUTELY NO LOGO.",
    "- NO COMPANY NAME MARK.",
    "- NO TAGLINE OR SLOGAN.",
    "- NO motivational quote.",
    "- NO invented decorative text.",
    "",
    "LANGUAGE LOCK:",
    "- All visible text must be Vietnamese.",
    "- Preserve Vietnamese accents exactly.",
    "",
    "DATA FIDELITY IS ABSOLUTE:",
    "- Copy every supplied employee name, date, time, duration, status, work rate and KPI EXACTLY.",
    "- Never calculate a new value inside the image.",
    "- Never infer, correct, round, reinterpret or fabricate attendance values.",
    "- Missing values must display exactly as '—'.",
    "- If beauty conflicts with exact data, exact data wins.",
    "",
    "REQUIRED VERTICAL CONTENT ORDER:",
    "1) Small eyebrow.",
    "2) Large title.",
    "3) Subtitle.",
    "4) Date + update time.",
    "5) Four KPI cards.",
    "6) One total-duration summary strip.",
    "7) One concise overview/status block.",
    "8) One mobile-friendly detail section containing all 8 employees.",
    "9) One short footer note.",
    "",
    'EYEBROW: "BÁO CÁO NHÂN SỰ"',
    'TITLE: "BÁO CÁO CHẤM CÔNG — CA SÁNG"',
    'SUBTITLE: "Tổng hợp từ hệ thống chấm công để đối soát"',
    `DATE: "${request.date_text}"`,
    `UPDATE: "Cập nhật dữ liệu: ${request.updated_time_text}"`,
    "",
    "FOUR KPI CARDS — COPY EXACTLY:",
    `1) "Tổng nhân sự" = ${d.total_employees}`,
    `2) "Đã ghi nhận ca sáng" = ${d.recorded_count}`,
    `3) "Cần kiểm tra" = ${attention}`,
    `4) "Tỷ lệ ghi nhận" = ${d.attendance_rate}%`,
    "",
    "SUMMARY STRIP — COPY EXACTLY:",
    `"Tổng thời lượng xác nhận: ${d.total_hours_text}"`,
    `"Trung bình ${d.average_hours_text}/người (trên ${d.recorded_count} người đã ghi nhận)"`,
    "",
    "OVERVIEW — COPY EXACTLY:",
    `"Đã ghi nhận: ${d.recorded_count}"`,
    `"Chưa có bản ghi: ${d.missing_count}"`,
    `"Cần đối soát khác: ${d.review_count}"`,
    `"Tỷ lệ hoàn tất: ${d.attendance_rate}%"`,
    `"Có ${attention} nhân sự cần kiểm tra/đối soát dữ liệu ca sáng."`,
    "",
    'DETAIL SECTION TITLE: "CHI TIẾT CHẤM CÔNG CA SÁNG"',
    "Use a compact mobile-friendly table or stacked employee rows. Slight layout variation is allowed.",
    "Required fields in this order whenever shown as columns:",
    "STT | Họ và tên | Trạng thái | Giờ vào | Giờ ra | Thời lượng | Mức công",
    "Show all 8 employees exactly once, in the supplied order. Never omit, duplicate, rename or reorder.",
    "EMPLOYEE ROWS — COPY EXACTLY:",
    ...tableRows,
    "",
    'FOOTER: "Lưu ý: Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh."',
    "",
    "HARD FAIL CONDITIONS TO AVOID:",
    "- No FULL-DAY report.",
    "- No second report.",
    "- No logo, company name, slogan or extra decorative wording.",
    "- Do not omit the Mức công field.",
    "- Preserve the canonical employee spelling exactly as supplied, including 'Điêu Văn Mạnh'.",
    "",
    "QUALITY GATE BEFORE OUTPUT:",
    `- KPI must read exactly ${d.total_employees} / ${d.recorded_count} / ${attention} / ${d.attendance_rate}%.`,
    `- Confirmed duration must read exactly ${d.total_hours_text}.`,
    `- Average must read exactly ${d.average_hours_text}/người.`,
    `- Date must be exactly ${request.date_text}.`,
    `- Update time must be exactly ${request.updated_time_text}.`,
    "- Exactly 8 employees must be visible once each.",
    "- Every displayed check-in, check-out, duration, status and work-rate value must exactly match the supplied row data.",
    "OUTPUT ONLY: one polished mobile-first portrait infographic image.",
  ].join("\n");
}

function buildDailyPrompt(request) {
  const d = request.data;
  const attention = d.open_session_count + d.no_record_count + d.review_count;
  const rows = d.employees;
  const tableRows = rows.map((row, index) =>
    `${index + 1}. ${row.name} | ca sáng: ${row.morning_text} | ca chiều: ${row.afternoon_text} | tổng công: ${row.total_display} | trạng thái: ${row.status}`
  );

  return [
    "Create exactly ONE Vietnamese HR attendance infographic for FULL-DAY ATTENDANCE using APPROVED FULL-DAY MOBILE V9 STRICT DATA.",
    "The highest priority is DATA ACCURACY. Slight layout variation is allowed whenever it improves readability or data fidelity.",
    "",
    "MOBILE-FIRST OUTPUT:",
    "- Portrait image optimized primarily for phone viewing in Microsoft Teams.",
    "- Preferred aspect: 2:3 to 9:16 portrait. Preferred generation size 1024x1536 or equivalent mobile portrait.",
    "- Large readable typography, large KPI numbers, clear row spacing, strong hierarchy, no tiny text.",
    "- One report only, one image only.",
    "- Use direct ChatGPT Image output only.",
    "",
    "SCOPE LOCK:",
    "- This image is ONLY the FULL-DAY attendance report.",
    "- Never include MORNING-ONLY attendance.",
    "- Never include a second report, second page, duplicate dashboard, or extra report block.",
    "",
    "VISUAL STYLE:",
    "- Premium modern HR/business infographic; bright, fresh and professional.",
    "- fresh bright green as main positive accent; combine with white/light neutral surfaces, deep navy/professional blue, restrained gold, and red/orange only for missing or attention states.",
    "- A subtle bright office / greenery header visual is allowed, but it must stay secondary to the data.",
    "- Rounded cards, generous white space, simple clean composition, crisp Vietnamese typography.",
    "- Do not force a dense desktop dashboard. Prefer a simple vertical reading flow.",
    "",
    "BRANDING LOCK:",
    "- ABSOLUTELY NO LOGO.",
    "- NO COMPANY NAME MARK.",
    "- NO TAGLINE OR SLOGAN.",
    "- NO motivational quote.",
    "- NO invented decorative text.",
    "",
    "LANGUAGE LOCK:",
    "- All visible text must be Vietnamese.",
    "- Preserve Vietnamese accents exactly.",
    "",
    "DATA FIDELITY IS ABSOLUTE:",
    "- Copy every supplied employee name, date, session time, session duration, total duration, status and KPI EXACTLY.",
    "- Never calculate a new value inside the image.",
    "- Never infer, correct, round, reinterpret or fabricate attendance values.",
    "- Missing values must display exactly as '—'.",
    "- If beauty conflicts with exact data, exact data wins.",
    "",
    "REQUIRED VERTICAL CONTENT ORDER:",
    "1) Small eyebrow.",
    "2) Large title.",
    "3) Subtitle.",
    "4) Date + update time.",
    "5) Four KPI cards.",
    "6) One total-hours summary strip.",
    "7) One concise overview/status block.",
    "8) One mobile-friendly detail section containing all 8 employees.",
    "9) One short footer note.",
    "",
    'EYEBROW: "BÁO CÁO NHÂN SỰ"',
    'TITLE: "BÁO CÁO CHẤM CÔNG — CẢ NGÀY"',
    'SUBTITLE: "Tổng hợp từ hệ thống chấm công để đối soát"',
    `DATE: "${request.date_text}"`,
    `UPDATE: "Cập nhật dữ liệu: ${request.updated_time_text}"`,
    "",
    "FOUR KPI CARDS — COPY EXACTLY:",
    `1) "Tổng nhân sự" = ${d.total_employees}`,
    `2) "Có dữ liệu chấm công" = ${d.with_record_count}`,
    `3) "Đã chốt đủ dữ liệu" = ${d.recorded_count}`,
    `4) "Tỷ lệ có bản ghi" = ${d.attendance_rate}%`,
    "",
    "SUMMARY STRIP — COPY EXACTLY:",
    `"Tổng giờ công đã xác nhận: ${d.total_hours_text}"`,
    `"Trung bình ${d.average_hours_text}/người (trên ${d.recorded_count} người đã chốt)"`,
    "",
    "OVERVIEW — COPY EXACTLY:",
    `"Đã ghi nhận đầy đủ: ${d.recorded_count}"`,
    `"Chưa chốt: ${d.open_session_count}"`,
    `"Chưa có bản ghi: ${d.no_record_count}"`,
    `"Cần đối soát/lỗi nguồn: ${d.review_count}"`,
    `"Tỷ lệ có bản ghi: ${d.attendance_rate}%"`,
    `"Có ${attention} nhân sự cần kiểm tra/đối soát dữ liệu cả ngày."`,
    "",
    'DETAIL SECTION TITLE: "CHI TIẾT CHẤM CÔNG CẢ NGÀY"',
    "Use a compact mobile-friendly table or stacked employee rows. Slight layout variation is allowed.",
    "Required fields in this order whenever shown as columns:",
    "STT | Họ và tên | Ca sáng | Ca chiều | Tổng công | Trạng thái",
    "Show all 8 employees exactly once, in the supplied order. Never omit, duplicate, rename or reorder.",
    "EMPLOYEE ROWS — COPY EXACTLY:",
    ...tableRows,
    "",
    'FOOTER: "Lưu ý: Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh."',
    "",
    "HARD FAIL CONDITIONS TO AVOID:",
    "- No MORNING-ONLY report.",
    "- No second report.",
    "- No logo, company name, slogan or extra decorative wording.",
    "- Preserve the canonical employee spelling exactly as supplied, including 'Điêu Văn Mạnh'.",
    "",
    "QUALITY GATE BEFORE OUTPUT:",
    `- KPI must read exactly ${d.total_employees} / ${d.with_record_count} / ${d.recorded_count} / ${d.attendance_rate}%.`,
    `- Total confirmed hours must read exactly ${d.total_hours_text}.`,
    `- Average must read exactly ${d.average_hours_text}/người.`,
    `- Date must be exactly ${request.date_text}.`,
    `- Update time must be exactly ${request.updated_time_text}.`,
    "- Exactly 8 employees must be visible once each.",
    "- Every displayed morning session, afternoon session, total duration and status must exactly match the supplied row data.",
    "OUTPUT ONLY: one polished mobile-first portrait infographic image.",
  ].join("\n");
}

export function buildAiVisualRequest(report) {
  const spec = loadSpec();
  const slotApproval = spec.approval?.[report.slot];
  if (!["approved","test-only"].includes(slotApproval)) {
    throw new Error("AI visual spec approval state is missing for slot");
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
    updated_time_text: displayTime(report.source_generated_at || report.generated_at),
    reference_asset: spec.reference_assets?.[report.slot] || null,
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
  if (!request.prompt.includes("DATA FIDELITY IS ABSOLUTE")) throw new Error("Prompt is missing data-fidelity lock");
  if (!request.prompt.includes("KPI must read exactly")) throw new Error("Prompt is missing KPI quality gate");
  if (request.slot === "morning_1230" && !request.prompt.includes("CHI TIẾT CHẤM CÔNG CA SÁNG")) throw new Error("Morning prompt is missing approved detail section");
  if (request.slot === "morning_1230" && !request.prompt.includes("APPROVED MORNING MOBILE V9 STRICT DATA")) throw new Error("Morning prompt is not locked to approved mobile V9 form");
  if (request.slot === "daily_2105" && !request.prompt.includes("APPROVED FULL-DAY MOBILE V9 STRICT DATA")) throw new Error("Daily prompt is not locked to approved mobile V9 form");
  if (request.slot === "daily_2105" && !request.prompt.includes("CHI TIẾT CHẤM CÔNG CẢ NGÀY")) throw new Error("Daily prompt is missing approved detail section");
  if (!request.prompt.includes("MOBILE-FIRST OUTPUT")) throw new Error("Prompt is missing mobile-first output lock");
  if (!request.prompt.includes("fresh bright green")) throw new Error("Prompt is missing approved fresh-green visual direction");
  return true;
}
