export const APPROVED_LAYOUT_VERSION = "ATTENDANCE_IMAGE_V2_APPROVED_2026_10_02";
export const CANVAS = Object.freeze({ width: 1600, height: 1200 });

const MIDDAY_SPLIT_MINUTE = 12 * 60 + 45;
const COLORS = Object.freeze({
  navy: "#062e62",
  navyDark: "#021d42",
  blue: "#2388f2",
  blueSoft: "#eaf4ff",
  gold: "#c58a22",
  green: "#16a34a",
  greenSoft: "#eaf8ef",
  red: "#ef3340",
  amber: "#d89b25",
  paper: "#f7fbff",
  ink: "#17365f",
  muted: "#617891",
  line: "#dbe6f0",
});

function esc(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function displayDate(isoDate) {
  const m = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "--/--/----";
  return m[3] + "/" + m[2] + "/" + m[1];
}

function weekdayLabel(isoDate) {
  const m = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const names = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
  return names[date.getUTCDay()] || "";
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

function shorten(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return text.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}

function confirmedMinutes(row, slot) {
  if (slot === "morning_1230") {
    return Number.isInteger(row?.morning?.minutes) ? row.morning.minutes : null;
  }
  return Number.isInteger(row?.total_minutes) ? row.total_minutes : null;
}

function compactStatus(row, slot) {
  const code = String(row?.status_code || "");
  if (slot === "morning_1230") {
    if (code === "recorded") return { text: "Đã chấm công", tone: "ok" };
    if (code === "working") return { text: "Đang làm việc", tone: "ok" };
    if (code === "not_recorded_morning") return { text: "Chưa chấm công", tone: "bad" };
  } else {
    if (code === "recorded") return { text: "Đã ghi nhận", tone: "ok" };
    if (code === "not_recorded") return { text: "Chưa chấm công", tone: "bad" };
    if (code === "open_session") return { text: "Chưa chốt", tone: "warn" };
  }
  if (code === "technical_error") return { text: "Lỗi nguồn", tone: "bad" };
  return { text: "Cần đối soát", tone: "warn" };
}

function toneColor(tone) {
  if (tone === "ok") return { fill: "#e9f8ef", ink: "#118547", dot: COLORS.green };
  if (tone === "bad") return { fill: "#fff0f1", ink: "#d72532", dot: COLORS.red };
  return { fill: "#fff6df", ink: "#a66b00", dot: COLORS.amber };
}

function splitDailySessions(row) {
  const result = { morning: [], afternoon: [] };
  for (const session of Array.isArray(row?.sessions) ? row.sessions : []) {
    const anchor = minuteOfDay(session?.in || session?.out);
    if (anchor == null) continue;
    if (anchor < MIDDAY_SPLIT_MINUTE) result.morning.push(session);
    else result.afternoon.push(session);
  }
  return result;
}

function sessionLabel(list) {
  if (!Array.isArray(list) || !list.length) return "—";
  return list.map((session) => {
    const left = session?.in || "—";
    const right = session?.out || "—";
    const duration = Number.isInteger(session?.minutes) ? " · " + fmtMinutes(session.minutes) : "";
    return left + "–" + right + duration;
  }).join("; ");
}

function card(x, y, w, label, value, detail, accent) {
  return [
    '<g filter="url(#shadow)">',
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="112" rx="18" fill="#ffffff" stroke="#dce7f0"/>',
    '<rect x="' + x + '" y="' + y + '" width="7" height="112" rx="4" fill="' + accent + '"/>',
    '<text x="' + (x + 28) + '" y="' + (y + 43) + '" class="kpiLabel">' + esc(label) + '</text>',
    '<text x="' + (x + 28) + '" y="' + (y + 80) + '" class="kpiValue">' + esc(value) + '</text>',
    '<text x="' + (x + w - 22) + '" y="' + (y + 82) + '" text-anchor="end" class="kpiDetail">' + esc(detail) + '</text>',
    '</g>'
  ].join("");
}

function donut(cx, cy, radius, rate) {
  const bounded = Math.max(0, Math.min(100, Number(rate) || 0));
  const circumference = 2 * Math.PI * radius;
  const good = circumference * bounded / 100;
  return [
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="#edf2f7" stroke-width="20"/>',
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="' + COLORS.green + '" stroke-width="20" stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')" stroke-dasharray="' + good.toFixed(2) + ' ' + (circumference-good).toFixed(2) + '"/>',
    '<text x="' + cx + '" y="' + (cy + 9) + '" text-anchor="middle" font-size="34" font-weight="850" fill="#075e36">' + bounded + '%</text>',
  ].join("");
}

function architectureArt() {
  return [
    '<g opacity="0.94">',
    '<rect x="1270" y="30" width="105" height="130" rx="4" fill="#dbeaf5" stroke="#a6bfd3"/>',
    '<rect x="1385" y="8" width="132" height="152" rx="4" fill="url(#glass)" stroke="#91b5d1"/>',
    '<line x1="1218" y1="48" x2="1218" y2="164" stroke="' + COLORS.gold + '" stroke-width="5"/>',
    '<line x1="1218" y1="48" x2="1452" y2="48" stroke="' + COLORS.gold + '" stroke-width="5"/>',
    '<line x1="1328" y1="48" x2="1328" y2="86" stroke="' + COLORS.gold + '" stroke-width="3"/>',
    '<rect x="1316" y="82" width="24" height="8" rx="2" fill="' + COLORS.gold + '"/>',
    '</g>'
  ].join("");
}

function header(title, date) {
  const dateText = weekdayLabel(date) + ", " + displayDate(date);
  return [
    '<rect x="0" y="0" width="1600" height="184" fill="url(#headerBg)"/>',
    '<path d="M1450 0 L1600 0 L1600 184 L1536 184 L1582 134 L1510 134 L1572 62 Z" fill="' + COLORS.navy + '" opacity="0.96"/>',
    '<path d="M1398 0 L1454 0 L1580 130 L1554 154 Z" fill="' + COLORS.gold + '" opacity="0.72"/>',
    architectureArt(),
    '<rect x="44" y="34" width="82" height="6" rx="3" fill="url(#gold)"/>',
    '<text x="44" y="79" class="eyebrow">BÁO CÁO CHẤM CÔNG</text>',
    '<text x="44" y="131" class="title">' + esc(title) + '</text>',
    '<text x="44" y="165" class="date">' + esc(dateText) + '</text>',
    '<text x="850" y="146" class="headerNote">Tổng hợp từ hệ thống chấm công để đối soát</text>',
  ].join("");
}

function morningTable(rows) {
  const x = 40, y = 360, w = 1140, rowH = 50, headH = 48;
  const widths = [48, 228, 164, 106, 106, 120, 368];
  const headers = ["#", "HỌ VÀ TÊN", "TRẠNG THÁI", "GIỜ VÀO", "GIỜ RA", "THỜI LƯỢNG", "MỨC CÔNG"];
  const out = [
    '<g filter="url(#softShadow)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (headH + rowH * 8) + '" rx="16" fill="#fff" stroke="#dce7f0"/></g>'
  ];
  let cx = x;
  headers.forEach((h, i) => {
    const cw = widths[i];
    out.push('<rect x="' + cx + '" y="' + y + '" width="' + cw + '" height="' + headH + '" fill="' + COLORS.navy + '"/>');
    out.push('<text x="' + (cx + cw / 2) + '" y="' + (y + 31) + '" text-anchor="middle" class="th">' + esc(h) + '</text>');
    cx += cw;
  });
  rows.forEach((row, index) => {
    const ry = y + headH + index * rowH;
    const fill = index % 2 === 0 ? "#ffffff" : "#f8fbfe";
    const status = compactStatus(row, "morning_1230");
    const tone = toneColor(status.tone);
    const morning = row?.morning || {};
    const minutes = confirmedMinutes(row, "morning_1230");
    const bar = minutes == null ? 0 : Math.min(1, minutes / 300) * 294;
    out.push('<rect x="' + x + '" y="' + ry + '" width="' + w + '" height="' + rowH + '" fill="' + fill + '"/>');
    out.push('<line x1="' + x + '" y1="' + (ry + rowH) + '" x2="' + (x+w) + '" y2="' + (ry+rowH) + '" stroke="#e5edf4"/>');
    const cellX = [x, x+48, x+276, x+440, x+546, x+652, x+772];
    out.push('<text x="' + (cellX[0]+24) + '" y="' + (ry+32) + '" text-anchor="middle" class="td">' + (index+1) + '</text>');
    out.push('<text x="' + (cellX[1]+14) + '" y="' + (ry+32) + '" class="td name">' + esc(shorten(row.name, 26)) + '</text>');
    out.push('<rect x="' + (cellX[2]+10) + '" y="' + (ry+10) + '" width="144" height="30" rx="15" fill="' + tone.fill + '"/>');
    out.push('<circle cx="' + (cellX[2]+27) + '" cy="' + (ry+25) + '" r="8" fill="' + tone.dot + '"/>');
    out.push('<text x="' + (cellX[2]+42) + '" y="' + (ry+30) + '" font-size="13.5" font-weight="750" fill="' + tone.ink + '">' + esc(status.text) + '</text>');
    out.push('<text x="' + (cellX[3]+53) + '" y="' + (ry+32) + '" text-anchor="middle" class="td">' + esc(morning.in || "—") + '</text>');
    out.push('<text x="' + (cellX[4]+53) + '" y="' + (ry+32) + '" text-anchor="middle" class="td">' + esc(morning.out || "—") + '</text>');
    out.push('<text x="' + (cellX[5]+60) + '" y="' + (ry+32) + '" text-anchor="middle" class="td strong">' + esc(minutes == null ? "—" : fmtMinutes(minutes)) + '</text>');
    out.push('<rect x="' + (cellX[6]+24) + '" y="' + (ry+17) + '" width="294" height="16" rx="8" fill="#e7eef5"/>');
    if (bar > 0) out.push('<rect x="' + (cellX[6]+24) + '" y="' + (ry+17) + '" width="' + bar.toFixed(1) + '" height="16" rx="8" fill="url(#blueBar)"/>');
  });
  return out.join("");
}

function dailyTable(rows) {
  const x = 40, y = 360, w = 1140, rowH = 50, headH = 48;
  const widths = [48, 225, 252, 252, 130, 233];
  const headers = ["#", "HỌ VÀ TÊN", "CA SÁNG", "CA CHIỀU", "TỔNG CÔNG", "TRẠNG THÁI"];
  const out = ['<g filter="url(#softShadow)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (headH + rowH*8) + '" rx="16" fill="#fff" stroke="#dce7f0"/></g>'];
  let cx = x;
  headers.forEach((h, i) => {
    const cw = widths[i];
    const fill = i === 2 ? "#114f8a" : i === 3 ? "#0b6f4d" : COLORS.navy;
    out.push('<rect x="' + cx + '" y="' + y + '" width="' + cw + '" height="' + headH + '" fill="' + fill + '"/>');
    out.push('<text x="' + (cx + cw/2) + '" y="' + (y+31) + '" text-anchor="middle" class="th">' + esc(h) + '</text>');
    cx += cw;
  });
  rows.forEach((row, index) => {
    const ry = y + headH + index * rowH;
    const fill = index % 2 === 0 ? "#ffffff" : "#f8fbfe";
    const split = splitDailySessions(row);
    const morning = sessionLabel(split.morning);
    const afternoon = sessionLabel(split.afternoon);
    const status = compactStatus(row, "daily_2105");
    const tone = toneColor(status.tone);
    const cellX = [x, x+48, x+273, x+525, x+777, x+907];
    out.push('<rect x="' + x + '" y="' + ry + '" width="' + w + '" height="' + rowH + '" fill="' + fill + '"/>');
    out.push('<rect x="' + cellX[2] + '" y="' + ry + '" width="252" height="' + rowH + '" fill="' + COLORS.blueSoft + '" opacity="0.56"/>');
    out.push('<rect x="' + cellX[3] + '" y="' + ry + '" width="252" height="' + rowH + '" fill="' + COLORS.greenSoft + '" opacity="0.56"/>');
    out.push('<line x1="' + x + '" y1="' + (ry+rowH) + '" x2="' + (x+w) + '" y2="' + (ry+rowH) + '" stroke="#e5edf4"/>');
    out.push('<text x="' + (cellX[0]+24) + '" y="' + (ry+32) + '" text-anchor="middle" class="td">' + (index+1) + '</text>');
    out.push('<text x="' + (cellX[1]+14) + '" y="' + (ry+32) + '" class="td name">' + esc(shorten(row.name, 25)) + '</text>');
    out.push('<text x="' + (cellX[2]+126) + '" y="' + (ry+31) + '" text-anchor="middle" font-size="' + (morning.length > 25 ? 13 : 14.5) + '" font-weight="680" fill="#0b4d86">' + esc(shorten(morning, 34)) + '</text>');
    out.push('<text x="' + (cellX[3]+126) + '" y="' + (ry+31) + '" text-anchor="middle" font-size="' + (afternoon.length > 25 ? 13 : 14.5) + '" font-weight="680" fill="#0b6f4d">' + esc(shorten(afternoon, 34)) + '</text>');
    out.push('<text x="' + (cellX[4]+65) + '" y="' + (ry+33) + '" text-anchor="middle" font-size="22" font-weight="850" fill="' + COLORS.navy + '">' + esc(row.total_display || "—") + '</text>');
    out.push('<rect x="' + (cellX[5]+12) + '" y="' + (ry+10) + '" width="205" height="30" rx="15" fill="' + tone.fill + '"/>');
    out.push('<circle cx="' + (cellX[5]+29) + '" cy="' + (ry+25) + '" r="8" fill="' + tone.dot + '"/>');
    out.push('<text x="' + (cellX[5]+44) + '" y="' + (ry+30) + '" font-size="13.5" font-weight="750" fill="' + tone.ink + '">' + esc(status.text) + '</text>');
  });
  return out.join("");
}

function sideSummary(rows, slot) {
  const x = 1200, y = 360, w = 360, h = 448;
  const recorded = rows.filter((row) => slot === "morning_1230"
    ? ["recorded","working"].includes(String(row?.status_code || ""))
    : String(row?.status_code || "") === "recorded").length;
  const total = rows.length;
  const review = Math.max(0, total - recorded);
  const rate = Math.round(recorded * 100 / Math.max(1,total));
  const minutes = rows.reduce((sum,row) => sum + (confirmedMinutes(row,slot) || 0), 0);
  const title = slot === "morning_1230" ? "TỔNG QUAN CA SÁNG" : "TỔNG QUAN CẢ NGÀY";
  return [
    '<g filter="url(#softShadow)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="18" fill="#ffffff" stroke="#dce7f0"/></g>',
    '<text x="' + (x+24) + '" y="' + (y+42) + '" font-size="20" font-weight="850" fill="' + COLORS.navy + '">' + title + '</text>',
    donut(x+180,y+150,70,rate),
    '<line x1="' + (x+24) + '" y1="' + (y+245) + '" x2="' + (x+w-24) + '" y2="' + (y+245) + '" stroke="#e1e9f0"/>',
    '<circle cx="' + (x+38) + '" cy="' + (y+285) + '" r="8" fill="' + COLORS.green + '"/>',
    '<text x="' + (x+58) + '" y="' + (y+291) + '" font-size="16" fill="' + COLORS.ink + '">Đã ghi nhận</text>',
    '<text x="' + (x+w-28) + '" y="' + (y+291) + '" text-anchor="end" font-size="18" font-weight="850" fill="' + COLORS.navy + '">' + recorded + '/' + total + '</text>',
    '<circle cx="' + (x+38) + '" cy="' + (y+326) + '" r="8" fill="' + (review ? COLORS.red : "#b8c5d2") + '"/>',
    '<text x="' + (x+58) + '" y="' + (y+332) + '" font-size="16" fill="' + COLORS.ink + '">Cần đối soát</text>',
    '<text x="' + (x+w-28) + '" y="' + (y+332) + '" text-anchor="end" font-size="18" font-weight="850" fill="' + COLORS.navy + '">' + review + '</text>',
    '<circle cx="' + (x+38) + '" cy="' + (y+367) + '" r="8" fill="' + COLORS.gold + '"/>',
    '<text x="' + (x+58) + '" y="' + (y+373) + '" font-size="16" fill="' + COLORS.ink + '">' + (slot === "morning_1230" ? "Tổng công sáng" : "Tổng giờ công") + '</text>',
    '<text x="' + (x+w-28) + '" y="' + (y+373) + '" text-anchor="end" font-size="18" font-weight="850" fill="' + COLORS.navy + '">' + esc(fmtMinutes(minutes)) + '</text>',
    '<rect x="' + (x+22) + '" y="' + (y+397) + '" width="' + (w-44) + '" height="30" rx="15" fill="#f3f7fb"/>',
    '<text x="' + (x+w/2) + '" y="' + (y+418) + '" text-anchor="middle" font-size="13.5" font-weight="650" fill="' + COLORS.muted + '">Chỉ tổng hợp thời lượng đã xác nhận</text>',
  ].join("");
}

function overviewChart(rows, slot) {
  const x = 40, y = 835, w = 1520, h = 250;
  const scale = slot === "morning_1230" ? 300 : 600;
  const label = slot === "morning_1230" ? "SO SÁNH CÔNG CA SÁNG" : "SO SÁNH TỔNG CÔNG CẢ NGÀY";
  const baseY = y + 176;
  const areaH = 112;
  const left = x + 50;
  const chartW = w - 90;
  const gap = 18;
  const bw = (chartW - gap*7) / 8;
  const out = [
    '<g filter="url(#softShadow)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="18" fill="#ffffff" stroke="#dce7f0"/></g>',
    '<text x="' + (x+24) + '" y="' + (y+38) + '" font-size="20" font-weight="850" fill="' + COLORS.navy + '">' + label + '</text>',
    '<text x="' + (x+w-24) + '" y="' + (y+38) + '" text-anchor="end" font-size="13.5" fill="' + COLORS.muted + '">Thang đối soát: ' + (slot === "morning_1230" ? "5 giờ" : "10 giờ") + '</text>',
  ];
  [0,0.5,1].forEach((ratio) => {
    const gy = baseY - areaH*ratio;
    out.push('<line x1="' + left + '" y1="' + gy + '" x2="' + (left+chartW) + '" y2="' + gy + '" stroke="#e5edf4"/>');
    out.push('<text x="' + (left-10) + '" y="' + (gy+5) + '" text-anchor="end" font-size="12" fill="#71869c">' + Math.round((scale/60)*ratio) + '</text>');
  });
  rows.forEach((row,index) => {
    const minutes = confirmedMinutes(row,slot);
    const ratio = minutes == null ? 0 : Math.max(0,Math.min(1,minutes/scale));
    const bh = ratio*areaH;
    const bx = left + index*(bw+gap);
    const by = baseY-bh;
    out.push('<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="6" fill="' + (slot === "morning_1230" ? "url(#blueBar)" : "url(#greenBar)") + '"/>');
    out.push('<text x="' + (bx+bw/2).toFixed(1) + '" y="' + Math.max(y+66,by-7).toFixed(1) + '" text-anchor="middle" font-size="13" font-weight="800" fill="' + COLORS.navy + '">' + esc(minutes == null ? "—" : fmtMinutes(minutes)) + '</text>');
    const parts = String(row.name || "").split(" ");
    const shortName = parts.length > 1 ? parts[parts.length-1] : String(row.name || "");
    out.push('<text x="' + (bx+bw/2).toFixed(1) + '" y="' + (baseY+28) + '" text-anchor="middle" font-size="12.5" font-weight="700" fill="' + COLORS.ink + '">' + esc(shortName) + '</text>');
  });
  return out.join("");
}

function footer() {
  return [
    '<rect x="0" y="1112" width="1600" height="88" fill="url(#navy)"/>',
    '<path d="M0 1112 L170 1112 L90 1200 L0 1200 Z" fill="' + COLORS.gold + '" opacity="0.9"/>',
    '<path d="M1480 1200 L1600 1200 L1600 1112 Z" fill="' + COLORS.gold + '" opacity="0.9"/>',
    '<text x="190" y="1148" font-size="15.5" font-weight="650" fill="#ffffff">Lưu ý: Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức.</text>',
    '<text x="190" y="1176" font-size="14.5" font-weight="600" fill="#d9e7f4">Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh.</text>',
    '<text x="1460" y="1165" text-anchor="end" font-size="12.5" font-weight="800" fill="#e8c36c">FORM V2 · 1600×1200</text>',
  ].join("");
}

function svgFrame() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">',
    '<defs>',
    '<linearGradient id="headerBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.62" stop-color="#f4f9fd"/><stop offset="1" stop-color="#dcecf8"/></linearGradient>',
    '<linearGradient id="navy" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#021d42"/><stop offset="1" stop-color="#0b4c86"/></linearGradient>',
    '<linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef7fd"/><stop offset="1" stop-color="#a8cbe4"/></linearGradient>',
    '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b97812"/><stop offset="1" stop-color="#dda82c"/></linearGradient>',
    '<linearGradient id="blueBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1769c2"/><stop offset="1" stop-color="#48a2f8"/></linearGradient>',
    '<linearGradient id="greenBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#128647"/><stop offset="1" stop-color="#4fc477"/></linearGradient>',
    '<filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0b345b" flood-opacity="0.08"/></filter>',
    '<filter id="softShadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#0b345b" flood-opacity="0.055"/></filter>',
    '<style>.base{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif}.eyebrow{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:18px;font-weight:800;letter-spacing:1.5px;fill:#a66b00}.title{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:46px;font-weight:900;fill:#062e62}.date{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:22px;font-weight:800;fill:#17365f}.headerNote{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:16px;font-weight:650;fill:#617891}.kpiLabel{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:15px;font-weight:750;fill:#617891}.kpiValue{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:31px;font-weight:900;fill:#062e62}.kpiDetail{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:13px;font-weight:650;fill:#7a8fa4}.th{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:13.5px;font-weight:850;fill:#ffffff}.td{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:15px;font-weight:650;fill:#17365f}.name{font-size:15px;font-weight:750}.strong{font-weight:900;fill:#062e62}</style>',
    '</defs>',
    '<rect width="1600" height="1200" fill="#f7fbff"/>'
  ].join("");
}

function kpis(report) {
  const rows = report.employees;
  const slot = report.slot;
  const total = rows.length;
  const recorded = rows.filter((row) => slot === "morning_1230"
    ? ["recorded","working"].includes(String(row?.status_code || ""))
    : String(row?.status_code || "") === "recorded").length;
  const pending = Math.max(0,total-recorded);
  const rate = Math.round(recorded*100/Math.max(1,total));
  const minutes = rows.reduce((sum,row) => sum + (confirmedMinutes(row,slot) || 0),0);
  const y=216,w=370,gap=14;
  if (slot === "morning_1230") {
    return [
      card(40,y,w,"Tổng nhân sự",String(total),"roster xác nhận",COLORS.navy),
      card(40+(w+gap),y,w,"Đã chấm công",recorded+"/"+total,"ca sáng",COLORS.blue),
      card(40+2*(w+gap),y,w,"Chưa chấm công",String(pending),"cần kiểm tra",COLORS.red),
      card(40+3*(w+gap),y,w,"Tỷ lệ chấm công",rate+"%","ca sáng",COLORS.green),
    ].join("");
  }
  return [
    card(40,y,w,"Tổng nhân sự",String(total),"roster xác nhận",COLORS.navy),
    card(40+(w+gap),y,w,"Đã chấm công",recorded+"/"+total,"cả ngày",COLORS.blue),
    card(40+2*(w+gap),y,w,"Tổng giờ công",fmtMinutes(minutes),"đã xác nhận",COLORS.gold),
    card(40+3*(w+gap),y,w,"Tỷ lệ chấm công",rate+"%","cả ngày",COLORS.green),
  ].join("");
}

export function buildMorningAttendanceReportSvg(report) {
  return [
    svgFrame(),
    header("CHẤM CÔNG CA SÁNG", report.date),
    kpis(report),
    morningTable(report.employees),
    sideSummary(report.employees,"morning_1230"),
    overviewChart(report.employees,"morning_1230"),
    footer(),
    '</svg>'
  ].join("");
}

export function buildDailyAttendanceReportSvg(report) {
  return [
    svgFrame(),
    header("CHẤM CÔNG CẢ NGÀY", report.date),
    kpis(report),
    dailyTable(report.employees),
    sideSummary(report.employees,"daily_2105"),
    overviewChart(report.employees,"daily_2105"),
    footer(),
    '</svg>'
  ].join("");
}

export function buildAttendanceReportSvg(report) {
  if (!report || report.kind !== "attendance_business_report") {
    throw new Error("Invalid attendance business report");
  }
  if (!["morning_1230","daily_2105"].includes(report.slot)) {
    throw new Error("Unsupported attendance slot");
  }
  if (!Array.isArray(report.employees) || report.employees.length !== 8) {
    throw new Error("Approved image layout requires exactly 8 employees");
  }
  if (report.slot === "morning_1230") return buildMorningAttendanceReportSvg(report);
  return buildDailyAttendanceReportSvg(report);
}
