const DAY_NAMES = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

export const TEAMS_HOSTED_CONTENT_LIMIT = 4 * 1024 * 1024;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatVietnameseDate(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Invalid report date");
  const date = new Date(`${isoDate}T00:00:00+07:00`);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid report date");
  return `${DAY_NAMES[date.getDay()]}, ${match[3]}/${match[2]}/${match[1]}`;
}

function slotLabel(slot) {
  if (slot === "morning_1230") return "CA SÁNG";
  if (slot === "daily_2105") return "CẢ NGÀY";
  throw new Error("Unsupported attendance slot");
}

export function buildTeamsHostedImagePayload({
  report,
  imageBase64,
  testLabel = "",
}) {
  if (!report || report.kind !== "attendance_business_report") {
    throw new Error("Invalid attendance business report");
  }
  const label = slotLabel(report.slot);
  const dateText = formatVietnameseDate(report.date);
  if (!String(imageBase64 || "").trim()) {
    throw new Error("Missing image base64");
  }

  const testFooter = String(testLabel || "").trim()
    ? `<br><span style="color:#6b7280"><i>${esc(testLabel)}</i></span>`
    : "";

  const body = [
    `<b>BÁO CÁO CHẤM CÔNG — ${label}</b>`,
    `<br><b>${esc(dateText)}</b>`,
    "<br>Tổng hợp từ hệ thống chấm công để đối soát.",
    "<br><br>",
    `<img src="../hostedContents/1/\$value" width="900" alt="Báo cáo chấm công ${label.toLowerCase()} ${esc(report.date)}">`,
    "<br><br>",
    "<b>Lưu ý:</b> Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. ",
    "Nếu phát hiện sai lệch hoặc có vướng mắc, vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh.",
    testFooter,
  ].join("");

  return {
    body: {
      contentType: "html",
      content: body,
    },
    hostedContents: [
      {
        "@microsoft.graph.temporaryId": "1",
        contentBytes: String(imageBase64),
        contentType: "image/png",
      },
    ],
  };
}
