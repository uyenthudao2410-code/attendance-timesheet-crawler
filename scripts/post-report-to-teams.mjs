import fs from "node:fs";
import path from "node:path";
import {TEAMS_HOSTED_CONTENT_LIMIT,buildTeamsHostedImagePayload} from "../src/teams-image-publisher.mjs";
const GRAPH="https://graph.microsoft.com/v1.0";
const TEST_CHAT_ID="19:0e02d613cded448892f27d74cff19d63@thread.v2";
function required(name){const v=String(process.env[name]||"").trim();if(!v)throw new Error(`Missing required environment variable: ${name}`);return v;}
async function token(){
  const form=new URLSearchParams({client_id:required("MS_CLIENT_ID"),grant_type:"refresh_token",refresh_token:required("MS_REFRESH_TOKEN"),scope:"offline_access https://graph.microsoft.com/ChatMessage.Send"});
  const secret=String(process.env.MS_CLIENT_SECRET||"").trim();if(secret)form.set("client_secret",secret);
  const res=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(required("MS_TENANT_ID"))}/oauth2/v2.0/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
  if(!res.ok)throw new Error(`Microsoft token refresh failed: HTTP ${res.status} ${(await res.text()).slice(0,500)}`);
  const value=String((await res.json()).access_token||"").trim();if(!value)throw new Error("Missing Microsoft access token");return value;
}
const trigger=JSON.parse(fs.readFileSync(".github/attendance-rerun-trigger.json","utf8")),delivery=trigger?.delivery||{};
if(delivery.enabled!==true){console.log("TEAMS_DELIVERY=SKIPPED");process.exit(0);}
const mode=String(delivery.mode||"").toUpperCase();
if(mode!=="TEST")throw new Error("Attendance Teams delivery remains locked to TEST mode until V5 template approval");
if(delivery.target_type!=="chat"||String(delivery.chat_id||"")!==TEST_CHAT_ID)throw new Error("Attendance TEST target mismatch");
const slot=String(process.env.ATTENDANCE_RUN_SLOT||"").trim(),date=String(process.env.TARGET_DATE||"").trim();
const report=JSON.parse(fs.readFileSync(path.join("output",`report-${slot}-${date}.json`),"utf8"));
const image=fs.readFileSync(path.join("output",`attendance-${slot}-${date}.png`));
if(image.length<=0||image.length>TEAMS_HOSTED_CONTENT_LIMIT)throw new Error("V5 image violates hosted-content limit");
if(image.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")throw new Error("V5 image is not PNG");
if(image.readUInt32BE(16)!==1080||image.readUInt32BE(20)!==1440)throw new Error("V5 image dimensions mismatch");
const payload=buildTeamsHostedImagePayload({report,imageBase64:image.toString("base64"),mode});
const res=await fetch(`${GRAPH}/chats/${encodeURIComponent(TEST_CHAT_ID)}/messages`,{method:"POST",headers:{Authorization:`Bearer ${await token()}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
if(!res.ok)throw new Error(`Teams V5 hosted-image post failed: HTTP ${res.status} ${(await res.text()).slice(0,1000)}`);
const id=String((await res.json())?.id||"").trim();if(!id)throw new Error("Teams V5 post returned no message id");
console.log(`TEAMS_MESSAGE_ID=${id}`);
if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,`ATTENDANCE_TEAMS_MESSAGE_ID=${id}\n`,"utf8");
