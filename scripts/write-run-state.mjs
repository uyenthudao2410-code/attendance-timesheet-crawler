import fs from "node:fs/promises";
import path from "node:path";
const slot=String(process.env.ATTENDANCE_RUN_SLOT||"").trim(),date=String(process.env.TARGET_DATE||"").trim();
const requestId=String(process.env.ATTENDANCE_REQUEST_ID||"").trim(),requestedAt=String(process.env.ATTENDANCE_REQUESTED_AT||"").trim();
const crawlCompletedAt=String(process.env.ATTENDANCE_CRAWL_COMPLETED_AT||"").trim(),crawlEmployeeCount=Number(process.env.ATTENDANCE_CRAWL_EMPLOYEE_COUNT||"0");
const runId=String(process.env.GITHUB_RUN_ID||"").trim(),runAttempt=Number(process.env.GITHUB_RUN_ATTEMPT||"1"),triggerCommitSha=String(process.env.GITHUB_SHA||"").trim();
const artifactId=String(process.env.ARTIFACT_ID||"").trim(),artifactName=String(process.env.ARTIFACT_NAME||"").trim();
const rosterFingerprint=String(process.env.ATTENDANCE_ROSTER_FINGERPRINT||"").trim(),identityFingerprint=String(process.env.ATTENDANCE_IDENTITY_FINGERPRINT||"").trim();
const reportFile=String(process.env.ATTENDANCE_REPORT_FILE||"").trim(),reportSha256=String(process.env.ATTENDANCE_REPORT_SHA256||"").trim();
const layout=String(process.env.ATTENDANCE_IMAGE_LAYOUT_VERSION||"").trim(),count=Number(process.env.ATTENDANCE_IMAGE_COUNT||"0");
const overviewFile=String(process.env.ATTENDANCE_IMAGE_OVERVIEW_FILE||"").trim(),overviewSha=String(process.env.ATTENDANCE_IMAGE_OVERVIEW_SHA256||"").trim();
const detailFile=String(process.env.ATTENDANCE_IMAGE_DETAIL_FILE||"").trim(),detailSha=String(process.env.ATTENDANCE_IMAGE_DETAIL_SHA256||"").trim();
const ow=Number(process.env.ATTENDANCE_IMAGE_OVERVIEW_WIDTH||"0"),oh=Number(process.env.ATTENDANCE_IMAGE_OVERVIEW_HEIGHT||"0"),dw=Number(process.env.ATTENDANCE_IMAGE_DETAIL_WIDTH||"0"),dh=Number(process.env.ATTENDANCE_IMAGE_DETAIL_HEIGHT||"0");
const teamsMessageId=String(process.env.ATTENDANCE_TEAMS_MESSAGE_ID||"").trim();
if(!["morning_1230","daily_2105"].includes(slot))throw new Error("Unsupported ATTENDANCE_RUN_SLOT");
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d+$/.test(runId)||!/^\d+$/.test(artifactId))throw new Error("Invalid attendance state identity");
if(crawlEmployeeCount!==8)throw new Error("Crawl barrier did not confirm 8 employees");
if(!/^[a-f0-9]{40}$/.test(triggerCommitSha)||![rosterFingerprint,identityFingerprint,reportSha256,overviewSha,detailSha].every(v=>/^[a-f0-9]{64}$/.test(v)))throw new Error("Invalid attendance state hashes");
if(reportFile!==`output/report-${slot}-${date}.json`)throw new Error("Invalid report file");
if(layout!=="ATTENDANCE_IMAGE_V3_MOBILE_FIRST_2026_10_02"||count!==2)throw new Error("Invalid V3 image layout");
if(overviewFile!==`output/attendance-${slot}-${date}-01-overview.png`||detailFile!==`output/attendance-${slot}-${date}-02-detail.png`)throw new Error("Invalid V3 image files");
if(ow!==1080||oh!==1350||dw!==1080||dh!==1620)throw new Error("Invalid V3 image dimensions");
if(teamsMessageId&&!/^\d+$/.test(teamsMessageId))throw new Error("Invalid Teams message id");
const completedAt=new Date().toISOString();
const value={
  schema_version:6,run_id:runId,run_attempt:runAttempt,request_id:requestId,requested_at:requestedAt,trigger_commit_sha:triggerCommitSha,
  slot,target_date:date,crawl_complete:true,crawl_employee_count:crawlEmployeeCount,crawl_completed_at:crawlCompletedAt,
  artifact_id:artifactId,artifact_name:artifactName,roster_fingerprint:rosterFingerprint,identity_fingerprint:identityFingerprint,
  encryption:"rsa-oaep-sha256+aes-256-cbc-pbkdf2-200000",report_file:reportFile,report_sha256:reportSha256,
  image_layout_version:layout,image_count:2,
  images:[
    {role:"overview",file:overviewFile,sha256:overviewSha,width:ow,height:oh},
    {role:"detail",file:detailFile,sha256:detailSha,width:dw,height:dh}
  ],
  teams_message_id:teamsMessageId||null,completed_at:completedAt
};
const dir=path.join(".github","attendance-state");await fs.mkdir(dir,{recursive:true});const out=path.join(dir,`${slot}.json`);await fs.writeFile(out,JSON.stringify(value,null,2)+"\n","utf8");process.stdout.write(out);
