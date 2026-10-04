import fs from "node:fs";
import { TEAMS_HOSTED_CONTENT_LIMIT, buildTeamsHostedImagePayload } from "../src/teams-image-publisher.mjs";
import {
  ATTENDANCE_EXPECTED_GRAPH_USER,
  ATTENDANCE_TEST_CHAT_ID,
  validateChatGptDirectImageTrigger,
} from "../src/attendance-routing.mjs";

const GRAPH = "https://graph.microsoft.com/v1.0";
const triggerPath = ".github/attendance-ai-post-trigger.json";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function accessToken() {
  const form = new URLSearchParams({
    client_id: required("MS_CLIENT_ID"),
    grant_type: "refresh_token",
    refresh_token: required("MS_REFRESH_TOKEN"),
    scope: "offline_access https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/Files.Read https://graph.microsoft.com/User.Read",
  });
  const secret = String(process.env.MS_CLIENT_SECRET || "").trim();
  if (secret) form.set("client_secret", secret);
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(required("MS_TENANT_ID"))}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form },
  );
  if (!response.ok) {
    throw new Error(`Microsoft token refresh failed: HTTP ${response.status} ${(await response.text()).slice(0, 800)}`);
  }
  const token = String((await response.json()).access_token || "").trim();
  if (!token) throw new Error("Missing Microsoft access token");
  return token;
}

const trigger = JSON.parse(fs.readFileSync(triggerPath, "utf8"));
const validated = validateChatGptDirectImageTrigger(trigger);
if (!validated.enabled) {
  console.log("ATTENDANCE_AI_POST=SKIPPED");
  process.exit(0);
}

const { slot, date, summary, transportTest } = validated;
const driveId = String(trigger.drive_id).trim();
const itemId = String(trigger.item_id).trim();

const token = await accessToken();

const meResponse = await fetch(
  `${GRAPH}/me?$select=id,displayName,userPrincipalName,mail`,
  { headers: { Authorization: `Bearer ${token}` } },
);
if (!meResponse.ok) throw new Error(`Microsoft Graph /me failed: HTTP ${meResponse.status}`);
const me = await meResponse.json();
const delegatedUser = String(me.userPrincipalName || me.mail || "").trim().toLowerCase();
console.log(`GRAPH_DELEGATED_USER=${delegatedUser}`);
if (delegatedUser !== ATTENDANCE_EXPECTED_GRAPH_USER) {
  throw new Error(`Attendance publisher token must belong to ${ATTENDANCE_EXPECTED_GRAPH_USER}; got ${delegatedUser || "unknown"}`);
}

const fileResponse = await fetch(
  `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
  { headers: { Authorization: `Bearer ${token}` } },
);
if (!fileResponse.ok) {
  throw new Error(`ChatGPT final image download failed: HTTP ${fileResponse.status} ${(await fileResponse.text()).slice(0, 800)}`);
}
const image = Buffer.from(await fileResponse.arrayBuffer());
if (image.length <= 0 || image.length > TEAMS_HOSTED_CONTENT_LIMIT) {
  throw new Error("ChatGPT final image violates Teams hosted-content size limit");
}
if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
  throw new Error("ChatGPT final image is not PNG");
}
const width = image.readUInt32BE(16);
const height = image.readUInt32BE(20);
const ratio = width / height;
if (width < 900 || height < 1400 || ratio < 0.55 || ratio > 0.78) {
  throw new Error(`ChatGPT final image dimensions/aspect are outside approved mobile portrait range: ${width}x${height}`);
}

const report = {
  kind: "attendance_business_report",
  slot,
  date,
  summary,
  transport_test: transportTest === true,
};
const payload = buildTeamsHostedImagePayload({
  report,
  imageBase64: image.toString("base64"),
  mode: "TEST",
});

const post = await fetch(
  `${GRAPH}/chats/${encodeURIComponent(ATTENDANCE_TEST_CHAT_ID)}/messages`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  },
);
if (!post.ok) {
  throw new Error(`Teams ChatGPT image post failed: HTTP ${post.status} ${(await post.text()).slice(0, 1000)}`);
}
const result = await post.json();
const messageId = String(result?.id || "").trim();
if (!messageId) throw new Error("Teams ChatGPT image post returned no message id");

console.log(`ATTENDANCE_AI_TEAMS_MESSAGE_ID=${messageId}`);
console.log(JSON.stringify({
  slot,
  date,
  image_origin: trigger.image_origin,
  direct_output: trigger.direct_output,
  edited_after_generation: trigger.edited_after_generation,
  fallback_renderer_used: trigger.fallback_renderer_used,
  qa_status: trigger.qa_status,
  transport_test: transportTest === true,
  width,
  height,
  bytes: image.length,
  message_id: messageId,
}));
