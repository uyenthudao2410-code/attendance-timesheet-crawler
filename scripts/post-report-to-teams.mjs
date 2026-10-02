import fs from "node:fs";
import path from "node:path";
import {
  TEAMS_HOSTED_CONTENT_LIMIT,
  buildTeamsHostedImagePayload,
} from "../src/teams-image-publisher.mjs";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TEST_CHAT_ID = "19:0e02d613cded448892f27d74cff19d63@thread.v2";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function refreshAccessToken() {
  const tenant = required("MS_TENANT_ID");
  const clientId = required("MS_CLIENT_ID");
  const refreshToken = required("MS_REFRESH_TOKEN");
  const form = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "offline_access https://graph.microsoft.com/ChatMessage.Send",
  });
  const clientSecret = String(process.env.MS_CLIENT_SECRET || "").trim();
  if (clientSecret) form.set("client_secret", clientSecret);

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft token refresh failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  const json = await response.json();
  const token = String(json.access_token || "").trim();
  if (!token) throw new Error("Microsoft token response did not contain access_token");
  return token;
}

const trigger = JSON.parse(
  fs.readFileSync(".github/attendance-rerun-trigger.json", "utf8"),
);
const delivery = trigger?.delivery || {};
if (delivery.enabled !== true) {
  console.log("TEAMS_DELIVERY=SKIPPED");
  process.exit(0);
}
if (String(delivery.mode || "").toUpperCase() !== "TEST") {
  throw new Error("Attendance Teams delivery is currently locked to TEST mode");
}
if (delivery.target_type !== "chat") {
  throw new Error("Attendance TEST delivery requires target_type=chat");
}
const chatId = String(delivery.chat_id || "").trim();
if (chatId !== TEST_CHAT_ID) {
  throw new Error("Attendance TEST delivery target does not match locked TEST chat");
}

const slot = String(process.env.ATTENDANCE_RUN_SLOT || "").trim();
const targetDate = String(process.env.TARGET_DATE || "").trim();
const reportPath = path.join("output", `report-${slot}-${targetDate}.json`);
const imagePath = path.join("output", `attendance-${slot}-${targetDate}.png`);

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (report.slot !== slot || report.date !== targetDate) {
  throw new Error("Attendance report identity mismatch before Teams delivery");
}
const image = fs.readFileSync(imagePath);
if (image.length <= 0 || image.length > TEAMS_HOSTED_CONTENT_LIMIT) {
  throw new Error(
    `Attendance image violates Teams hosted-content budget: ${image.length} bytes`,
  );
}
if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
  throw new Error("Attendance Teams image is not a PNG");
}

const payload = buildTeamsHostedImagePayload({
  report,
  imageBase64: image.toString("base64"),
  testLabel: "Bản kiểm thử nội bộ • TEST hệ thống",
});

const token = await refreshAccessToken();
const endpoint = `${GRAPH}/chats/${encodeURIComponent(chatId)}/messages`;
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});
if (!response.ok) {
  const text = await response.text();
  throw new Error(
    `Teams hosted-image post failed: HTTP ${response.status} ${text.slice(0, 1000)}`,
  );
}
const data = await response.json();
const messageId = String(data?.id || "").trim();
if (!messageId) {
  throw new Error("Teams hosted-image post succeeded without message id");
}
console.log(`TEAMS_TARGET_CHAT=${chatId}`);
console.log(`TEAMS_IMAGE_BYTES=${image.length}`);
console.log(`TEAMS_MESSAGE_ID=${messageId}`);

if (process.env.GITHUB_ENV) {
  fs.appendFileSync(
    process.env.GITHUB_ENV,
    `ATTENDANCE_TEAMS_MESSAGE_ID=${messageId}\n`,
    "utf8",
  );
}
