export const APPROVED_LAYOUT_VERSION = "ATTENDANCE_IMAGE_V1_APPROVED_2026_10_02";
export const CANVAS = Object.freeze({ width: 1200, height: 1800 });

const MIDDAY_SPLIT_MINUTE = 12 * 60 + 45;

function esc(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function displayDate(isoDate) {
  const parts = String(isoDate || "").split("-");
  if (parts.length !== 3) return "--/--/----";
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

function weekdayLabel(isoDate) {
  const date = new Date(String(isoDate || "") + "T00:00:00+07:00");
  if (!Number.isFinite(date.getTime())) return "";
  const value = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long"
  }).format(date);
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function minuteOfDay(value) {
  const match = String(value || "").match(/^([01][0-9]|2[0-3]):([0-5][0-9])$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function fmtMinutes(minutes) {
  if (!Number.isInteger(minutes) || minutes < 0) return "—";
  return Math.floor(minutes / 60) + "h" + String(minutes % 60).padStart(2, "0");
}

function compactStatus(row, slot) {
  const code = String(row && row.status_code || "");
  if (slot === "morning_1230") {
    if (code === "recorded") return { text: "Đã chấm công", tone: "ok" };
    if (code === "working") return { text: "Đang làm việc", tone: "ok" };
    if (code === "not_recorded_morning") return { text: "Chưa có bản ghi", tone: "bad" };
  } else {
    if (code === "recorded") {
      const text = String(row.status_text || "Đã ghi nhận");
      return { text: text.length <= 27 ? text : "Đã ghi nhận", tone: "ok" };
    }
    if (code === "not_recorded") return { text: "Chưa có bản ghi", tone: "bad" };
    if (code === "open_session") return { text: "Chưa chốt", tone: "warn" };
  }
  if (code === "technical_error") return { text: "Lỗi nguồn", tone: "bad" };
  return { text: "Cần đối soát", tone: "warn" };
}

function confirmedMinutes(row, slot) {
  if (slot === "morning_1230") {
    return Number.isInteger(row && row.morning && row.morning.minutes) ? row.morning.minutes : null;
  }
  return Number.isInteger(row && row.total_minutes) ? row.total_minutes : null;
}

function splitDailySessions(row) {
  const result = { morning: [], afternoon: [] };
  const sessions = Array.isArray(row && row.sessions) ? row.sessions : [];
  for (const session of sessions) {
    const anchor = minuteOfDay(session && (session.in || session.out));
    if (anchor == null) continue;
    if (anchor < MIDDAY_SPLIT_MINUTE) result.morning.push(session);
    else result.afternoon.push(session);
  }
  return result;
}

function sessionLabel(list) {
  if (!Array.isArray(list) || !list.length) return "—";
  return list.map(function (session) {
    const left = session && session.in ? session.in : "—";
    const right = session && session.out ? session.out : "—";
    const duration = Number.isInteger(session && session.minutes) ? " · " + fmtMinutes(session.minutes) : "";
    return left + "–" + right + duration;
  }).join("; ");
}

function shorten(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return text.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}

function toneColor(tone) {
  if (tone === "ok") return { fill: "#e9f8ef", ink: "#118547", dot: "#16a34a" };
  if (tone === "bad") return { fill: "#fff0f1", ink: "#d72532", dot: "#ef3340" };
  return { fill: "#fff6df", ink: "#a66b00", dot: "#d89b25" };
}

function architectureArt() {
  const out = [];
  out.push('<g opacity="0.98">');
  out.push('<rect x="778" y="96" width="128" height="208" rx="5" fill="#dceaf6" stroke="#9fbed7"/>');
  out.push('<rect x="916" y="54" width="142" height="250" rx="5" fill="url(#glass)" stroke="#8bb0ce"/>');
  out.push('<rect x="1066" y="130" width="92" height="174" rx="4" fill="#e5eef7" stroke="#a8bfd3"/>');
  for (let y = 78; y < 286; y += 26) {
    out.push('<line x1="930" y1="' + y + '" x2="1044" y2="' + y + '" stroke="#b8d0e4" stroke-width="2"/>');
  }
  for (let x = 940; x < 1040; x += 25) {
    out.push('<line x1="' + x + '" y1="62" x2="' + x + '" y2="296" stroke="#b8d0e4" stroke-width="2"/>');
  }
  out.push('<line x1="720" y1="102" x2="720" y2="292" stroke="#c58a22" stroke-width="6"/>');
  out.push('<line x1="720" y1="102" x2="954" y2="102" stroke="#c58a22" stroke-width="6"/>');
  out.push('<line x1="720" y1="102" x2="682" y2="155" stroke="#c58a22" stroke-width="5"/>');
  out.push('<line x1="866" y1="102" x2="866" y2="151" stroke="#c58a22" stroke-width="3"/>');
  out.push('<rect x="853" y="145" width="26" height="9" rx="2" fill="#c58a22"/>');
  out.push('</g>');
  return out.join("");
}

function skylineArt() {
  const out = ['<g opacity="0.46" fill="#7fa6c5">'];
  const widths = [42, 26, 56, 34, 30, 52, 24, 40, 64, 30, 46, 25, 55, 31, 49, 27, 60];
  let x = 50;
  widths.forEach(function (w, index) {
    const h = 28 + (index % 5) * 13 + (index % 3) * 7;
    out.push('<rect x="' + x + '" y="' + (1764 - h) + '" width="' + w + '" height="' + h + '"/>');
    x += w + 12;
  });
  out.push('</g>');
  return out.join("");
}

function summaryCard(x, y, width, label, value, sub, accent, icon) {
  return [
    '<g filter="url(#shadow)">',
    '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="142" rx="18" fill="#ffffff" stroke="#d9e5ef"/>',
    '<circle cx="' + (x + 58) + '" cy="' + (y + 52) + '" r="28" fill="' + accent + '" opacity="0.10"/>',
    '<text x="' + (x + 58) + '" y="' + (y + 61) + '" text-anchor="middle" font-size="30" font-weight="800" fill="' + accent + '">' + esc(icon) + '</text>',
    '<text x="' + (x + 108) + '" y="' + (y + 58) + '" class="kpiValue">' + esc(value) + '</text>',
    '<text x="' + (x + 108) + '" y="' + (y + 87) + '" class="kpiLabel">' + esc(label) + '</text>',
    '<text x="' + (x + 108) + '" y="' + (y + 111) + '" class="kpiSub">' + esc(sub) + '</text>',
    '</g>'
  ].join("");
}

function donut(cx, cy, radius, rate) {
  const bounded = Math.max(0, Math.min(100, rate));
  const circumference = 2 * Math.PI * radius;
  const green = circumference * bounded / 100;
  return [
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="#ef3340" stroke-width="22" opacity="0.92"/>',
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="#16a34a" stroke-width="22" stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')" stroke-dasharray="' + green.toFixed(2) + ' ' + (circumference - green).toFixed(2) + '"/>',
    '<text x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" font-size="42" font-weight="850" fill="#075e36">' + bounded + '%</text>'
  ].join("");
}

function renderMorningTable(rows) {
  const x = 40;
  const y = 650;
  const widths = [50, 210, 170, 100, 100, 120, 370];
  const headers = ["#", "HỌ VÀ TÊN", "TRẠNG THÁI", "GIỜ VÀO", "GIỜ RA", "THỜI LƯỢNG", "BIỂU ĐỒ CÔNG (5 GIỜ)"];
  const out = [];
  out.push('<g filter="url(#softShadow)"><rect x="' + x + '" y="' + y + '" width="1120" height="548" rx="16" fill="#fff" stroke="#d9e5ef"/></g>');
  out.push('<rect x="' + x + '" y="' + y + '" width="1120" height="58" rx="16" fill="url(#navy)"/>');
  out.push('<rect x="' + x + '" y="' + (y + 30) + '" width="1120" height="28" fill="url(#navy)"/>');
  let cx = x;
  headers.forEach(function (header, index) {
    const w = widths[index];
    out.push('<text x="' + (cx + w / 2) + '" y="' + (y + 37) + '" text-anchor="middle" class="th">' + esc(header) + '</text>');
    if (index > 0) out.push('<line x1="' + cx + '" y1="' + y + '" x2="' + cx + '" y2="' + (y + 548) + '" stroke="#dce6ef"/>');
    cx += w;
  });
  rows.forEach(function (row, index) {
    const ry = y + 58 + index * 61;
    const fill = index % 2 === 0 ? "#ffffff" : "#f8fbfe";
    out.push('<rect x="' + x + '" y="' + ry + '" width="1120" height="61" fill="' + fill + '"/>');
    out.push('<line x1="' + x + '" y1="' + (ry + 61) + '" x2="' + (x + 1120) + '" y2="' + (ry + 61) + '" stroke="#e5edf4"/>');
    const status = compactStatus(row, "morning_1230");
    const tone = toneColor(status.tone);
    const session = row && row.morning ? row.morning : {};
    const minutes = confirmedMinutes(row, "morning_1230");
    const barWidth = minutes == null ? 0 : Math.max(0, Math.min(1, minutes / 300)) * 322;
    const cellX = [x, x + 50, x + 260, x + 430, x + 530, x + 630, x + 750];
    out.push('<text x="' + (cellX[0] + 25) + '" y="' + (ry + 38) + '" text-anchor="middle" class="td">' + (index + 1) + '</text>');
    out.push('<text x="' + (cellX[1] + 14) + '" y="' + (ry + 38) + '" class="td name">' + esc(shorten(row.name, 24)) + '</text>');
    out.push('<rect x="' + (cellX[2] + 10) + '" y="' + (ry + 14) + '" width="150" height="34" rx="17" fill="' + tone.fill + '"/>');
    out.push('<circle cx="' + (cellX[2] + 28) + '" cy="' + (ry + 31) + '" r="10" fill="' + tone.dot + '"/>');
    out.push('<text x="' + (cellX[2] + 28) + '" y="' + (ry + 36) + '" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">' + (status.tone === "ok" ? "✓" : "!") + '</text>');
    out.push('<text x="' + (cellX[2] + 44) + '" y="' + (ry + 37) + '" font-size="15" font-weight="750" fill="' + tone.ink + '">' + esc(status.text) + '</text>');
    out.push('<text x="' + (cellX[3] + 50) + '" y="' + (ry + 38) + '" text-anchor="middle" class="td">' + esc(session.in || "—") + '</text>');
    out.push('<text x="' + (cellX[4] + 50) + '" y="' + (ry + 38) + '" text-anchor="middle" class="td">' + esc(session.out || "—") + '</text>');
    out.push('<text x="' + (cellX[5] + 60) + '" y="' + (ry + 38) + '" text-anchor="middle" class="td strong">' + esc(minutes == null ? "—" : fmtMinutes(minutes)) + '</text>');
    out.push('<rect x="' + (cellX[6] + 22) + '" y="' + (ry + 21) + '" width="322" height="20" rx="6" fill="#e6edf3"/>');
    if (barWidth > 0) out.push('<rect x="' + (cellX[6] + 22) + '" y="' + (ry + 21) + '" width="' + barWidth.toFixed(1) + '" height="20" rx="6" fill="url(#blueBar)"/>');
  });
  return out.join("");
}

function renderDailyTable(rows) {
  const x = 40;
  const y = 650;
  const widths = [50, 210, 245, 245, 120, 250];
  const headers = ["#", "HỌ VÀ TÊN", "CA SÁNG", "CA CHIỀU", "TỔNG CÔNG", "TRẠNG THÁI"];
  const out = [];
  out.push('<g filter="url(#softShadow)"><rect x="' + x + '" y="' + y + '" width="1120" height="548" rx="16" fill="#fff" stroke="#d9e5ef"/></g>');
  out.push('<rect x="' + x + '" y="' + y + '" width="1120" height="58" rx="16" fill="url(#navy)"/>');
  out.push('<rect x="' + x + '" y="' + (y + 30) + '" width="1120" height="28" fill="url(#navy)"/>');
  let cx = x;
  headers.forEach(function (header, index) {
    const w = widths[index];
    out.push('<text x="' + (cx + w / 2) + '" y="' + (y + 37) + '" text-anchor="middle" class="th">' + esc(header) + '</text>');
    if (index > 0) out.push('<line x1="' + cx + '" y1="' + y + '" x2="' + cx + '" y2="' + (y + 548) + '" stroke="#dce6ef"/>');
    cx += w;
  });
  rows.forEach(function (row, index) {
    const ry = y + 58 + index * 61;
    const fill = index % 2 === 0 ? "#ffffff" : "#f8fbfe";
    const split = splitDailySessions(row);
    const morning = sessionLabel(split.morning);
    const afternoon = sessionLabel(split.afternoon);
    const status = compactStatus(row, "daily_2105");
    const tone = toneColor(status.tone);
    const cellX = [x, x + 50, x + 260, x + 505, x + 750, x + 870];
    out.push('<rect x="' + x + '" y="' + ry + '" width="1120" height="61" fill="' + fill + '"/>');
    out.push('<line x1="' + x + '" y1="' + (ry + 61) + '" x2="' + (x + 1120) + '" y2="' + (ry + 61) + '" stroke="#e5edf4"/>');
    out.push('<text x="' + (cellX[0] + 25) + '" y="' + (ry + 38) + '" text-anchor="middle" class="td">' + (index + 1) + '</text>');
    out.push('<text x="' + (cellX[1] + 14) + '" y="' + (ry + 38) + '" class="td name">' + esc(shorten(row.name, 24)) + '</text>');
    out.push('<text x="' + (cellX[2] + 122.5) + '" y="' + (ry + 38) + '" text-anchor="middle" font-size="' + (morning.length > 26 ? 13 : 15) + '" font-weight="650" fill="#17365f">' + esc(shorten(morning, 34)) + '</text>');
    out.push('<text x="' + (cellX[3] + 122.5) + '" y="' + (ry + 38) + '" text-anchor="middle" font-size="' + (afternoon.length > 26 ? 13 : 15) + '" font-weight="650" fill="#17365f">' + esc(shorten(afternoon, 34)) + '</text>');
    out.push('<text x="' + (cellX[4] + 60) + '" y="' + (ry + 39) + '" text-anchor="middle" font-size="24" font-weight="850" fill="#062e62">' + esc(row.total_display || "—") + '</text>');
    out.push('<rect x="' + (cellX[5] + 12) + '" y="' + (ry + 14) + '" width="226" height="34" rx="17" fill="' + tone.fill + '"/>');
    out.push('<circle cx="' + (cellX[5] + 30) + '" cy="' + (ry + 31) + '" r="10" fill="' + tone.dot + '"/>');
    out.push('<text x="' + (cellX[5] + 30) + '" y="' + (ry + 36) + '" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">' + (status.tone === "ok" ? "✓" : "!") + '</text>');
    out.push('<text x="' + (cellX[5] + 46) + '" y="' + (ry + 37) + '" font-size="13.5" font-weight="750" fill="' + tone.ink + '">' + esc(shorten(status.text, 28)) + '</text>');
  });
  return out.join("");
}

function renderOverviewChart(rows, slot, scaleMinutes) {
  const x = 42;
  const y = 1232;
  const width = 795;
  const height = 410;
  const baseY = y + 300;
  const barAreaHeight = 240;
  const chartLeft = x + 42;
  const chartWidth = width - 78;
  const gap = 15;
  const barWidth = (chartWidth - gap * 7) / 8;
  const out = [];
  out.push('<g filter="url(#softShadow)"><rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" rx="18" fill="#fff" stroke="#d9e5ef"/></g>');
  out.push('<text x="' + (x + 22) + '" y="' + (y + 46) + '" font-size="25" font-weight="850" fill="#062e62">' + (slot === "morning_1230" ? "TỔNG QUAN CA SÁNG (5 GIỜ)" : "TỔNG QUAN CÔNG CẢ NGÀY (10 GIỜ)") + '</text>');
  for (let i = 0; i <= 5; i++) {
    const gy = baseY - i * (barAreaHeight / 5);
    out.push('<line x1="' + chartLeft + '" y1="' + gy + '" x2="' + (chartLeft + chartWidth) + '" y2="' + gy + '" stroke="#e1e9f0"/>');
    out.push('<text x="' + (chartLeft - 12) + '" y="' + (gy + 5) + '" text-anchor="end" font-size="13" fill="#58718d">' + Math.round(scaleMinutes / 60 * i / 5) + '</text>');
  }
  rows.forEach(function (row, index) {
    const minutes = confirmedMinutes(row, slot);
    const ratio = minutes == null ? 0 : Math.max(0, Math.min(1, minutes / scaleMinutes));
    const bh = ratio * barAreaHeight;
    const bx = chartLeft + index * (barWidth + gap);
    const by = baseY - bh;
    out.push('<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="5" fill="' + (slot === "morning_1230" ? "url(#blueBar)" : "url(#greenBar)") + '"/>');
    out.push('<text x="' + (bx + barWidth / 2).toFixed(1) + '" y="' + Math.max(y + 80, by - 9).toFixed(1) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#082d60">' + esc(minutes == null ? "—" : fmtMinutes(minutes)) + '</text>');
    const words = String(row.name || "").split(" ");
    const cut = Math.max(1, Math.ceil(words.length / 2));
    out.push('<text x="' + (bx + barWidth / 2).toFixed(1) + '" y="' + (baseY + 28) + '" text-anchor="middle" font-size="11.5" font-weight="650" fill="#29445f">' + esc(words.slice(0, cut).join(" ")) + '</text>');
    out.push('<text x="' + (bx + barWidth / 2).toFixed(1) + '" y="' + (baseY + 44) + '" text-anchor="middle" font-size="11.5" font-weight="650" fill="#29445f">' + esc(words.slice(cut).join(" ")) + '</text>');
  });
  return out.join("");
}

function renderRateCard(rate, recorded, total, slot) {
  const x = 856;
  const y = 1232;
  const width = 302;
  const height = 410;
  const pending = Math.max(0, total - recorded);
  return [
    '<g filter="url(#softShadow)"><rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" rx="18" fill="#fff" stroke="#d9e5ef"/></g>',
    '<text x="' + (x + 20) + '" y="' + (y + 46) + '" font-size="21" font-weight="850" fill="#062e62">' + (slot === "morning_1230" ? "TỶ LỆ CHẤM CÔNG CA SÁNG" : "TỶ LỆ CHẤM CÔNG CẢ NGÀY") + '</text>',
    donut(x + 151, y + 176, 82, rate),
    '<circle cx="' + (x + 45) + '" cy="' + (y + 314) + '" r="10" fill="#16a34a"/>',
    '<text x="' + (x + 65) + '" y="' + (y + 320) + '" font-size="17" fill="#17365f">Đã chấm công:</text>',
    '<text x="' + (x + 258) + '" y="' + (y + 320) + '" text-anchor="end" font-size="19" font-weight="850" fill="#062e62">' + recorded + '</text>',
    '<circle cx="' + (x + 45) + '" cy="' + (y + 350) + '" r="10" fill="#ef3340"/>',
    '<text x="' + (x + 65) + '" y="' + (y + 356) + '" font-size="17" fill="#17365f">Chưa chốt:</text>',
    '<text x="' + (x + 258) + '" y="' + (y + 356) + '" text-anchor="end" font-size="19" font-weight="850" fill="#062e62">' + pending + '</text>',
    '<line x1="' + (x + 28) + '" y1="' + (y + 378) + '" x2="' + (x + 274) + '" y2="' + (y + 378) + '" stroke="#dce6ef"/>',
    '<text x="' + (x + 151) + '" y="' + (y + 402) + '" text-anchor="middle" font-size="20" font-weight="850" fill="#062e62">Tổng: ' + total + '</text>'
  ].join("");
}

export function buildAttendanceReportSvg(report) {
  if (!report || report.kind !== "attendance_business_report") throw new Error("Invalid attendance business report");
  if (!["morning_1230", "daily_2105"].includes(report.slot)) throw new Error("Unsupported attendance slot");
  if (!Array.isArray(report.employees) || report.employees.length !== 8) throw new Error("Approved image layout requires exactly 8 employees");

  const slot = report.slot;
  const rows = report.employees;
  const title = slot === "morning_1230" ? "CHẤM CÔNG CA SÁNG" : "CHẤM CÔNG CẢ NGÀY";
  const scaleMinutes = slot === "morning_1230" ? 300 : 600;
  const totalMinutes = rows.reduce(function (sum, row) {
    const value = confirmedMinutes(row, slot);
    return sum + (Number.isInteger(value) ? value : 0);
  }, 0);
  const recorded = rows.filter(function (row) {
    return slot === "morning_1230"
      ? ["recorded", "working"].includes(String(row.status_code || ""))
      : String(row.status_code || "") === "recorded";
  }).length;
  const total = rows.length;
  const pending = total - recorded;
  const rate = Math.round(recorded * 100 / total);
  const dateText = weekdayLabel(report.date) + ", " + displayDate(report.date);

  const svg = [];
  svg.push('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">');
  svg.push('<defs>');
  svg.push('<linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.48" stop-color="#f6fbff"/><stop offset="1" stop-color="#dbeeff"/></linearGradient>');
  svg.push('<linearGradient id="navy" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#021d42"/><stop offset="1" stop-color="#0b4c86"/></linearGradient>');
  svg.push('<linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9f4fc"/><stop offset="1" stop-color="#9ec5e1"/></linearGradient>');
  svg.push('<linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b97812"/><stop offset="1" stop-color="#dda82c"/></linearGradient>');
  svg.push('<linearGradient id="blueBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1976d2"/><stop offset="1" stop-color="#46a2ff"/></linearGradient>');
  svg.push('<linearGradient id="greenBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#159a4c"/><stop offset="1" stop-color="#53c879"/></linearGradient>');
  svg.push('<filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0b345b" flood-opacity="0.09"/></filter>');
  svg.push('<filter id="softShadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#0b345b" flood-opacity="0.06"/></filter>');
  svg.push('<style>.base{font-family:Arial,"DejaVu Sans",sans-serif}.th{font-family:Arial,"DejaVu Sans",sans-serif;font-size:15px;font-weight:800;fill:#fff}.td{font-family:Arial,"DejaVu Sans",sans-serif;font-size:17px;font-weight:600;fill:#17365f}.name{font-size:16px}.strong{font-weight:850;fill:#062e62}.kpiValue{font-family:Arial,"DejaVu Sans",sans-serif;font-size:38px;font-weight:850;fill:#062e62}.kpiLabel{font-family:Arial,"DejaVu Sans",sans-serif;font-size:17px;font-weight:750;fill:#17365f}.kpiSub{font-family:Arial,"DejaVu Sans",sans-serif;font-size:14px;font-weight:600;fill:#617891}</style>');
  svg.push('</defs>');
  svg.push('<rect width="1200" height="1800" fill="#f8fbff"/>');
  svg.push('<rect x="0" y="0" width="1200" height="320" fill="url(#sky)"/>');
  svg.push('<path d="M1030 0 L1200 0 L1200 320 L1110 320 L1170 250 L1080 250 L1155 150 Z" fill="#062e62" opacity="0.94"/>');
  svg.push('<path d="M980 0 L1037 0 L1190 210 L1164 243 Z" fill="#dda82c" opacity="0.76"/>');
  svg.push(architectureArt());
  svg.push('<rect x="50" y="58" width="78" height="7" rx="3.5" fill="url(#gold)"/>');
  svg.push('<text x="50" y="125" class="base" font-size="49" font-weight="850" fill="#c58a22">BÁO CÁO</text>');
  svg.push('<text x="50" y="190" class="base" font-size="' + (slot === "morning_1230" ? 57 : 60) + '" font-weight="900" fill="#062e62">' + esc(title) + '</text>');
  svg.push('<text x="52" y="244" class="base" font-size="27" font-weight="800" fill="#0c3568">' + esc(dateText) + '</text>');
  svg.push('<text x="52" y="286" class="base" font-size="21" font-weight="600" fill="#3e5877">Thang biểu đồ đối soát: ' + (slot === "morning_1230" ? "5 giờ" : "10 giờ") + '</text>');

  if (slot === "morning_1230") {
    svg.push(summaryCard(40, 345, 350, "Đã chấm công", recorded + "/" + total, "ca sáng", "#1769d2", "✓"));
    svg.push(summaryCard(425, 345, 350, pending === 1 ? "Chưa có bản ghi" : "Chưa chốt", pending + "/" + total, "cần kiểm tra", "#ef3340", "!"));
    svg.push(summaryCard(810, 345, 350, "Tỷ lệ chấm công", rate + "%", "ca sáng", "#16a34a", "%"));
  } else {
    svg.push(summaryCard(40, 345, 350, "Đã chấm công", recorded + "/" + total, "cả ngày", "#1769d2", "✓"));
    svg.push(summaryCard(425, 345, 350, "Tổng công", fmtMinutes(totalMinutes), "đã xác nhận", "#c58a22", "◷"));
    svg.push(summaryCard(810, 345, 350, "Tỷ lệ chấm công", rate + "%", "cả ngày", "#16a34a", "%"));
  }

  svg.push('<g filter="url(#softShadow)"><rect x="40" y="520" width="1120" height="92" rx="17" fill="#fff8e8" stroke="#efd8a5"/></g>');
  svg.push('<circle cx="88" cy="566" r="25" fill="#c58a22" opacity="0.12"/>');
  svg.push('<text x="88" y="575" text-anchor="middle" class="base" font-size="27" font-weight="850" fill="#a66b00">◷</text>');
  svg.push('<text x="128" y="575" class="base" font-size="23" font-weight="700" fill="#17365f">Tổng giờ công đã ghi nhận:</text>');
  svg.push('<text x="485" y="577" class="base" font-size="40" font-weight="900" fill="#062e62">' + esc(fmtMinutes(totalMinutes)) + '</text>');
  svg.push('<line x1="620" y1="566" x2="780" y2="566" stroke="#c58a22" stroke-width="2" opacity="0.58"/>');
  svg.push('<text x="810" y="573" class="base" font-size="17" font-weight="650" fill="#6b7f94">Chỉ cộng các thời lượng đã xác nhận</text>');

  svg.push(slot === "morning_1230" ? renderMorningTable(rows) : renderDailyTable(rows));
  svg.push(renderOverviewChart(rows, slot, scaleMinutes));
  svg.push(renderRateCard(rate, recorded, total, slot));

  svg.push('<path d="M0 1685 L1200 1685 L1200 1800 L0 1800 Z" fill="url(#navy)"/>');
  svg.push('<path d="M0 1685 L0 1788 L145 1685 Z" fill="#d8a238" opacity="0.92"/>');
  svg.push('<path d="M1050 1800 L1200 1800 L1200 1690 Z" fill="#d8a238" opacity="0.92"/>');
  svg.push(skylineArt());
  svg.push('<text x="170" y="1740" class="base" font-size="17" font-weight="650" fill="#ffffff">Số liệu được tổng hợp từ phần mềm chấm công để đối soát, không mặc nhiên là giá trị công chính thức.</text>');
  svg.push('<text x="170" y="1770" class="base" font-size="16" font-weight="600" fill="#dbe8f5">Sai lệch hoặc vướng mắc cần thông tin P.HC-NS để kiểm tra và điều chỉnh.</text>');
  svg.push('<text x="1110" y="1760" text-anchor="end" class="base" font-size="13" font-weight="800" fill="#e8c36c">FORM ' + esc(APPROVED_LAYOUT_VERSION) + '</text>');
  svg.push('</svg>');
  return svg.join("");
}
