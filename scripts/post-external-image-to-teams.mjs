import fs from "node:fs";
import {TEAMS_HOSTED_CONTENT_LIMIT,buildTeamsHostedImagePayload} from "../src/teams-image-publisher.mjs";

const GRAPH="https://graph.microsoft.com/v1.0";
const TEST_CHAT_ID="19:0e02d613cded448892f27d74cff19d63@thread.v2";
const triggerPath=".github/attendance-ai-post-trigger.json";

function required(name){
  const value=String(process.env[name]||"").trim();
  if(!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
async function accessToken(){
  const form=new URLSearchParams({
    client_id:required("MS_CLIENT_ID"),
    grant_type:"refresh_token",
    refresh_token:required("MS_REFRESH_TOKEN"),
    scope:"offline_access https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/Files.Read",
  });
  const secret=String(process.env.MS_CLIENT_SECRET||"").trim();
  if(secret) form.set("client_secret",secret);
  const response=await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(required("MS_TENANT_ID"))}/oauth2/v2.0/token`,
    {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form},
  );
  if(!response.ok) throw new Error(`Microsoft token refresh failed: HTTP ${response.status} ${(await response.text()).slice(0,800)}`);
  const token=String((await response.json()).access_token||"").trim();
  if(!token) throw new Error("Missing Microsoft access token");
  return token;
}

const trigger=JSON.parse(fs.readFileSync(triggerPath,"utf8"));
if(trigger?.schema_version!==1) throw new Error("Invalid AI post trigger schema");
if(trigger?.enabled!==true){console.log("ATTENDANCE_AI_POST=SKIPPED");process.exit(0);}
if(String(trigger?.mode||"").toUpperCase()!=="TEST") throw new Error("AI post remains locked to TEST mode");
if(trigger?.target_type!=="chat"||String(trigger?.chat_id||"")!==TEST_CHAT_ID) throw new Error("AI post TEST target mismatch");

const slot=String(trigger?.slot||"").trim();
const date=String(trigger?.target_date||"").trim();
const driveId=String(trigger?.drive_id||"").trim();
const itemId=String(trigger?.item_id||"").trim();
if(!["morning_1230","daily_2105"].includes(slot)) throw new Error("Invalid AI post slot");
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid AI post target date");
if(!driveId||!itemId) throw new Error("Missing SharePoint/OneDrive drive or item id");

const token=await accessToken();
const meResponse=await fetch(`${GRAPH}/me?$select=id,displayName,userPrincipalName,mail`,{headers:{Authorization:`Bearer ${token}`}});
if(meResponse.ok){
  const me=await meResponse.json();
  console.log(`GRAPH_DELEGATED_USER=${String(me.userPrincipalName||me.mail||me.displayName||me.id||"unknown")}`);
}
try{
  const jwtPayload=JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString("utf8"));
  console.log(`GRAPH_SCOPES=${String(jwtPayload.scp||"")}`);
}catch{}
const fileResponse=await fetch(
  `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
  {headers:{Authorization:`Bearer ${token}`}},
);
if(!fileResponse.ok) throw new Error(`AI image download failed: HTTP ${fileResponse.status} ${(await fileResponse.text()).slice(0,800)}`);
const image=Buffer.from(await fileResponse.arrayBuffer());
if(image.length<=0||image.length>TEAMS_HOSTED_CONTENT_LIMIT) throw new Error("AI image violates Teams hosted-content limit");
if(image.subarray(0,8).toString("hex")!=="89504e470d0a1a0a") throw new Error("AI image is not PNG");
const width=image.readUInt32BE(16),height=image.readUInt32BE(20);
const ratio=width/height;
if(width<900||height<1200||Math.abs(ratio-0.75)>0.03) throw new Error(`AI image dimensions/aspect are outside approved range: ${width}x${height}`);

const report={kind:"attendance_business_report",slot,date};
const payload=buildTeamsHostedImagePayload({report,imageBase64:image.toString("base64"),mode:"TEST"});
const post=await fetch(
  `${GRAPH}/chats/${encodeURIComponent(TEST_CHAT_ID)}/messages`,
  {method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload)},
);
if(!post.ok) throw new Error(`Teams AI image post failed: HTTP ${post.status} ${(await post.text()).slice(0,1000)}`);
const result=await post.json();
const messageId=String(result?.id||"").trim();
if(!messageId) throw new Error("Teams AI image post returned no message id");
console.log(`ATTENDANCE_AI_TEAMS_MESSAGE_ID=${messageId}`);
console.log(JSON.stringify({slot,date,width,height,bytes:image.length,message_id:messageId}));
