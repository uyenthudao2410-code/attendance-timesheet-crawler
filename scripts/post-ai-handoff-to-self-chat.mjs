import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const GRAPH="https://graph.microsoft.com/v1.0";
const SELF_CHAT_ID="48:notes";

function required(name){
  const value=String(process.env[name]||"").trim();
  if(!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function esc(value){
  return String(value??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
async function accessToken(){
  const form=new URLSearchParams({
    client_id:required("MS_CLIENT_ID"),
    grant_type:"refresh_token",
    refresh_token:required("MS_REFRESH_TOKEN"),
    scope:"offline_access https://graph.microsoft.com/ChatMessage.Send",
  });
  const secret=String(process.env.MS_CLIENT_SECRET||"").trim();
  if(secret) form.set("client_secret",secret);
  const response=await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(required("MS_TENANT_ID"))}/oauth2/v2.0/token`,
    {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form},
  );
  if(!response.ok) throw new Error(`Microsoft token refresh failed: HTTP ${response.status} ${(await response.text()).slice(0,500)}`);
  const token=String((await response.json()).access_token||"").trim();
  if(!token) throw new Error("Missing Microsoft access token");
  return token;
}

const slot=String(process.env.ATTENDANCE_RUN_SLOT||"").trim();
const date=String(process.env.TARGET_DATE||"").trim();
const requestId=String(process.env.ATTENDANCE_REQUEST_ID||"").trim();
if(!["morning_1230","daily_2105"].includes(slot)) throw new Error("Unsupported attendance slot");
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid attendance date");
if(!requestId) throw new Error("Missing attendance request id");

const promptPath=path.join("output",`ai-visual-prompt-${slot}-${date}.txt`);
const prompt=fs.readFileSync(promptPath,"utf8").trim();
if(!prompt) throw new Error("AI visual prompt is empty");
const promptSha=crypto.createHash("sha256").update(prompt,"utf8").digest("hex");
const createdAt=new Date().toISOString();

const text=[
  "ATTENDANCE_AI_HANDOFF_V2",
  `REQUEST_ID=${requestId}`,
  `SLOT=${slot}`,
  `TARGET_DATE=${date}`,
  `CREATED_AT=${createdAt}`,
  `PROMPT_SHA256=${promptSha}`,
  "PROMPT_BEGIN",
  prompt,
  "PROMPT_END",
].join("\n");

if(Buffer.byteLength(text,"utf8")>24000) throw new Error("AI handoff message exceeds safe Teams message size");

const html=`<div style="font-family:Segoe UI,Arial,sans-serif;white-space:pre-wrap"><b>ATTENDANCE_AI_HANDOFF_V2</b><br>${esc(text.slice("ATTENDANCE_AI_HANDOFF_V2".length+1)).replaceAll("\n","<br>")}</div>`;
const response=await fetch(
  `${GRAPH}/chats/${encodeURIComponent(SELF_CHAT_ID)}/messages`,
  {
    method:"POST",
    headers:{Authorization:`Bearer ${await accessToken()}`,"Content-Type":"application/json"},
    body:JSON.stringify({body:{contentType:"html",content:html}}),
  },
);
if(!response.ok) throw new Error(`Teams self-chat AI handoff failed: HTTP ${response.status} ${(await response.text()).slice(0,1000)}`);
const body=await response.json();
const messageId=String(body?.id||"").trim();
if(!messageId) throw new Error("Teams self-chat handoff returned no message id");
console.log(`ATTENDANCE_AI_HANDOFF_MESSAGE_ID=${messageId}`);
console.log(`ATTENDANCE_AI_HANDOFF_PROMPT_SHA256=${promptSha}`);
if(process.env.GITHUB_ENV){
  fs.appendFileSync(process.env.GITHUB_ENV,
    `ATTENDANCE_AI_HANDOFF_MESSAGE_ID=${messageId}\nATTENDANCE_AI_HANDOFF_PROMPT_SHA256=${promptSha}\n`,
    "utf8",
  );
}
