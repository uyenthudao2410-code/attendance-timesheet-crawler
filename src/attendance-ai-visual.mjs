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

  const chartRows = rows.map((row, index) =>
    `${index + 1}. ${row.name} | chart label: ${chartHours(row.minutes)} | duration source: ${row.duration} | status: ${row.status}`
  );

  const tableRows = rows.map((row, index) =>
    `${index + 1}. ${row.name} | trạng thái: ${row.status} | giờ vào: ${row.check_in} | giờ ra: ${row.check_out} | thời lượng: ${row.duration} | mức công: ${row.work_rate_percent}%`
  );

  return [
    "Create ONE premium Vietnamese corporate HR attendance infographic for CA SÁNG using the APPROVED MORNING FORM V7.",
    "This prompt is a layout lock. Follow the approved composition exactly; do not simplify it into a summary-only card and do not invent a different dashboard.",
    "",
    "CANVAS / OUTPUT:",
    "- Vertical 1440x1920 PNG, exact 3:4 ratio, one single-page composition.",
    "- Optimized for Microsoft Teams on mobile and desktop; all Vietnamese text must remain crisp and readable.",
    "- Use direct ChatGPT Image output only.",
    "",
    "APPROVED VISUAL IDENTITY:",
    "- fresh bright green is the main positive color; combine with deep navy, professional blue, clean white/light-blue surfaces, warm gold for time/rate highlights, and red only for missing/attention states.",
    "- Premium bright modern office background with natural daylight, glass partitions, abundant fresh green plants and refined desk elements.",
    "- The office scene must feel energetic, fresh, business-like and professional, never playful or cartoonish.",
    "- Use generous white space, rounded cards, subtle depth/shadows and clean modern sans-serif typography.",
    "- Add tasteful greenery at the lower edge / corners to echo the approved form without covering data.",
    "",
    "BRANDING LOCK:",
    "- ABSOLUTELY NO LOGO.",
    "- NO COMPANY NAME MARK.",
    "- NO TAGLINE OR SLOGAN.",
    "- NO motivational quote.",
    "- NO invented decorative text.",
    "",
    "FIXED LAYOUT — DO NOT CHANGE THE ORDER:",
    "1) HEADER AREA: office + greenery visual, green eyebrow pill, large title, subtitle, date chip, update-time chip.",
    "2) KPI ROW: four equal cards in one row.",
    "3) GOLD SUMMARY STRIP: total confirmed duration on the left, average duration on the right.",
    "4) MIDDLE ROW: left = horizontal duration chart (about 65% width); right = overview card (about 35% width).",
    "5) DETAIL TABLE: full-width 8-row table.",
    "6) FOOTER NOTE: full-width blue information note.",
    "",
    "HEADER — COPY EXACTLY:",
    'EYEBROW: "BÁO CÁO NHÂN SỰ"',
    'TITLE: "BÁO CÁO CHẤM CÔNG — CA SÁNG"',
    'SUBTITLE: "Tổng hợp từ hệ thống chấm công để đối soát"',
    `DATE CHIP: "${request.date_text}"`,
    `UPDATE CHIP: "Cập nhật dữ liệu: ${request.updated_time_text}"`,
    "",
    "KPI ROW — COPY EXACTLY:",
    `CARD 1 / blue: "Tổng nhân sự" = ${d.total_employees}`,
    `CARD 2 / green: "Đã ghi nhận ca sáng" = ${d.recorded_count}`,
    `CARD 3 / red: "Cần kiểm tra" = ${attention}`,
    `CARD 4 / gold: "Tỷ lệ ghi nhận" = ${d.attendance_rate}%`,
    "",
    "GOLD SUMMARY STRIP — COPY EXACTLY:",
    `LEFT: "Tổng thời lượng xác nhận: ${d.total_hours_text}"`,
    `RIGHT: "Trung bình ${d.average_hours_text}/người"`,
    `RIGHT SMALL: "(trên ${d.recorded_count} người đã ghi nhận)"`,
    "",
    'LEFT MIDDLE PANEL TITLE: "THỜI LƯỢNG CA SÁNG THEO NHÂN SỰ"',
    'UNIT: "Đơn vị: giờ"',
    "CHART RULES:",
    "- Use horizontal bars exactly like the approved form.",
    "- Recorded employees use solid blue/green bars; missing employees use red dashed empty outlines and 0.0h.",
    "- X-axis 0 to 5 hours.",
    "- Preserve employee order exactly.",
    "- Chart values are display labels only; the exact duration remains governed by the detail table.",
    "CHART ROWS — COPY EXACTLY:",
    ...chartRows,
    "",
    'RIGHT MIDDLE PANEL TITLE: "TỔNG QUAN"',
    `ROW 1 / green check: "Đã ghi nhận" = ${d.recorded_count}`,
    `ROW 2 / red x: "Chưa có bản ghi" = ${d.missing_count}`,
    `ROW 3 / gray/amber: "Cần đối soát khác" = ${d.review_count}`,
    `ROW 4 / gold percent: "Tỷ lệ hoàn tất" = ${d.attendance_rate}%`,
    `RED ATTENTION BOX: "Có ${attention} nhân sự cần kiểm tra/đối soát dữ liệu ca sáng."`,
    "",
    'DETAIL TABLE TITLE: "CHI TIẾT CHẤM CÔNG CA SÁNG"',
    "TABLE COLUMNS — KEEP THIS ORDER:",
    "STT | Họ và tên | Trạng thái | Giờ vào | Giờ ra | Thời lượng | Mức công",
    "TABLE STYLE:",
    "- Green table header.",
    "- Light blue/white alternating rows.",
    "- Missing rows use subtle warm red/pink emphasis and red status pill.",
    "- Recorded rows use green status pill.",
    "- Bold exact duration for recorded rows.",
    "- Missing values must display exactly as '—'.",
    "TABLE ROWS — COPY EXACTLY, DO NOT ALTER:",
    ...tableRows,
    "",
    'FOOTER: "Lưu ý: Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh."',
    "",
    "DATA FIDELITY IS ABSOLUTE:",
    "- Copy every supplied employee name, Vietnamese accent, date, time, duration, status, work rate and KPI EXACTLY.",
    "- Never calculate new values inside the image.",
    "- Never correct, infer or fabricate missing attendance values.",
    "- Show all 8 employees exactly once and in the supplied order.",
    "- Preserve the canonical employee spelling exactly as supplied, including 'Điêu Văn Mạnh'.",
    "- If any text is long, reduce font size or wrap cleanly; never omit or paraphrase.",
    "",
    "QUALITY GATE BEFORE OUTPUT:",
    `- KPI must read exactly ${d.total_employees} / ${d.recorded_count} / ${attention} / ${d.attendance_rate}%.`,
    `- Confirmed duration must read exactly ${d.total_hours_text}.`,
    `- Average must read exactly ${d.average_hours_text}/người.`,
    `- Date must be exactly ${request.date_text}.`,
    `- Update time must be exactly ${request.updated_time_text}.`,
    "- Exactly 8 employee rows must be visible in the table.",
    "- Every displayed check-in/check-out/duration/status/work-rate value must exactly match the supplied row data.",
    "- No logo, no company name, no slogan, no extra decorative wording.",
    "OUTPUT ONLY: one polished 1440x1920 vertical infographic image.",
  ].join("\n");
}

function buildDailyPrompt(request) {
  const d = request.data;
  const attention = d.open_session_count + d.no_record_count + d.review_count;
  const recordedRows = d.employees.filter((row) => row.status_code === "recorded");
  const openRows = d.employees.filter((row) => row.status_code === "open_session");
  const missingRows = d.employees.filter((row) => row.status_code === "not_recorded");
  const reviewRows = d.employees.filter((row) => !["recorded","open_session","not_recorded"].includes(row.status_code));

  const recordedLines = recordedRows.map((row) => `• ${row.name}: tổng ${row.total_display}`);
  const openLines = openRows.map((row) => `• ${row.name}: ${row.status}`);
  const missingLines = missingRows.map((row) => `• ${row.name}`);
  const reviewLines = reviewRows.map((row) => `• ${row.name}: ${row.status}`);

  return [
    "Create ONE premium Vietnamese corporate HR attendance infographic for CẢ NGÀY.",
    "DIRECT-OUTPUT SAFE LAYOUT: vertical 1440x1920 PNG, 3:4 ratio, one unified composition, high-resolution for Microsoft Teams.",
    "ABSOLUTELY NO LOGO, NO COMPANY NAME, NO BRAND MARK, NO TAGLINE, NO SLOGAN, NO MOTIVATIONAL QUOTE, NO EXTRA TEXT.",
    "STYLE: premium bright modern office atmosphere with natural daylight, glass-office depth, fresh green plants and refined desk elements; fresh bright green + deep navy + professional blue + restrained gold; generous white space; rounded cards; subtle shadows; crisp Vietnamese typography.",
    "IMPORTANT: do NOT draw a detailed table and do NOT draw quantitative bar charts. Use simple cards and lists only so every supplied value remains exact.",
    "DATA FIDELITY IS ABSOLUTE: copy all supplied names, totals, date and KPIs EXACTLY; never infer or recalculate values; never rename employees.",
    "",
    'EYEBROW: "BÁO CÁO NHÂN SỰ"',
    'TITLE: "BÁO CÁO CHẤM CÔNG — CẢ NGÀY"',
    `DATE: "${request.date_text}"`,
    `UPDATE TIME: "Cập nhật dữ liệu: ${request.updated_time_text}"`,
    'SUBTITLE: "Tổng hợp dữ liệu chấm công cả ngày để đối soát"',
    "",
    "FOUR KPI CARDS — COPY EXACTLY:",
    `1) Tổng nhân sự: ${d.total_employees}`,
    `2) Có dữ liệu chấm công: ${d.with_record_count}`,
    `3) Đã chốt đủ dữ liệu: ${d.recorded_count}`,
    `4) Tỷ lệ có bản ghi: ${d.attendance_rate}%`,
    "",
    `HIGHLIGHT STRIP: "Tổng giờ công đã xác nhận: ${d.total_hours_text}"`,
    `SECONDARY TEXT: "Trung bình ${d.average_hours_text}/người (trên ${d.recorded_count} người đã chốt)"`,
    "",
    'SECTION A TITLE: "ĐÃ GHI NHẬN ĐẦY ĐỦ"',
    "Show exactly these employee cards with name and exact total duration:",
    ...recordedLines,
    ...(openLines.length ? ["", 'SECTION B TITLE: "CHƯA CHỐT"', ...openLines] : []),
    ...(missingLines.length ? ["", 'SECTION C TITLE: "CHƯA CÓ BẢN GHI"', ...missingLines] : []),
    ...(reviewLines.length ? ["", 'SECTION D TITLE: "CẦN ĐỐI SOÁT"', ...reviewLines] : []),
    "",
    `STATUS NOTE: "Có ${attention} nhân sự cần kiểm tra/đối soát dữ liệu cả ngày."`,
    "",
    'FOOTER: "Lưu ý: Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh."',
    "",
    "QUALITY GATE BEFORE OUTPUT:",
    `- KPI must read exactly ${d.total_employees} / ${d.with_record_count} / ${d.recorded_count} / ${d.attendance_rate}%.`,
    `- Total confirmed hours must read exactly ${d.total_hours_text}.`,
    `- Exactly ${d.total_employees} employee names must appear once each.`,
    "- Recorded employee total durations must exactly match the supplied cards.",
    "- No logo, no company name, no slogan, no motivational quote, no extra decorative words.",
    "- No detailed table, no numeric bar chart.",
    "OUTPUT ONLY: one polished 1440x1920 vertical infographic image.",
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
  if (request.slot === "morning_1230" && !request.prompt.includes("CHI TIẾT CHẤM CÔNG CA SÁNG")) throw new Error("Morning prompt is missing approved detail table");
  if (request.slot === "morning_1230" && !request.prompt.includes("THỜI LƯỢNG CA SÁNG THEO NHÂN SỰ")) throw new Error("Morning prompt is missing approved chart section");
  if (request.slot === "morning_1230" && !request.prompt.includes("APPROVED MORNING FORM V7")) throw new Error("Morning prompt is not locked to approved V7 form");
  if (!request.prompt.includes("fresh bright green")) throw new Error("Prompt is missing approved fresh-green visual direction");
  return true;
}
