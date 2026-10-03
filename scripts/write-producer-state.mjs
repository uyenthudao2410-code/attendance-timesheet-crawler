import fs from "node:fs/promises";
import path from "node:path";

const slot=String(process.env.ATTENDANCE_RUN_SLOT||"").trim();
const date=String(process.env.TARGET_DATE||"").trim();
const requestId=String(process.env.ATTENDANCE_REQUEST_ID||"").trim();
const requestedAt=String(process.env.ATTENDANCE_REQUESTED_AT||"").trim();
const runId=String(process.env.GITHUB_RUN_ID||"").trim();
const runAttempt=Number(process.env.GITHUB_RUN_ATTEMPT||"1");
const artifactId=String(process.env.ARTIFACT_ID||"").trim();
const artifactName=String(process.env.ARTIFACT_NAME||"").trim();
const reportFile=String(process.env.ATTENDANCE_REPORT_FILE||"").trim();
const reportSha256=String(process.env.ATTENDANCE_REPORT_SHA256||"").trim();
const promptSha256=String(process.env.ATTENDANCE_AI_VISUAL_REQUEST_SHA256||"").trim();
const specVersion=String(process.env.ATTENDANCE_AI_VISUAL_SPEC_VERSION||"").trim();
const handoffMessageId=String(process.env.ATTENDANCE_AI_HANDOFF_MESSAGE_ID||"").trim();
const handoffPromptSha=String(process.env.ATTENDANCE_AI_HANDOFF_PROMPT_SHA256||"").trim();
const crawlCompletedAt=String(process.env.ATTENDANCE_CRAWL_COMPLETED_AT||"").trim();
const crawlEmployeeCount=Number(process.env.ATTENDANCE_CRAWL_EMPLOYEE_COUNT||"0");

if(!["morning_1230","daily_2105"].includes(slot)) throw new Error("Unsupported attendance slot");
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^[0-9]+$/.test(runId)||!/^[0-9]+$/.test(artifactId)) throw new Error("Invalid producer state identity");
if(!requestId||!Number.isFinite(Date.parse(requestedAt))) throw new Error("Invalid producer request metadata");
if(crawlEmployeeCount!==8) throw new Error("Producer state requires 8 employee crawl barrier");
if(!/^[a-f0-9]{64}$/.test(reportSha256)||!/^[a-f0-9]{64}$/.test(promptSha256)||!/^[a-f0-9]{64}$/.test(handoffPromptSha)) throw new Error("Invalid producer hashes");
if(promptSha256!==handoffPromptSha) throw new Error("AI prompt hash does not match Teams handoff hash");
if(!handoffMessageId) throw new Error("Missing Teams self-chat handoff message id");
if(reportFile!==`output/report-${slot}-${date}.json`) throw new Error("Invalid producer report file");

const value={
  schema_version:10,
  role:"producer",
  run_id:runId,
  run_attempt:runAttempt,
  request_id:requestId,
  requested_at:requestedAt,
  slot,
  target_date:date,
  crawl_complete:true,
  crawl_employee_count:crawlEmployeeCount,
  crawl_completed_at:crawlCompletedAt,
  artifact_id:artifactId,
  artifact_name:artifactName,
  report_file:reportFile,
  report_sha256:reportSha256,
  ai_visual_spec_version:specVersion,
  ai_visual_request_sha256:promptSha256,
  teams_self_handoff_message_id:handoffMessageId,
  completed_at:new Date().toISOString(),
};

const dir=path.join(".github","attendance-state");
await fs.mkdir(dir,{recursive:true});
const out=path.join(dir,`${slot}.json`);
await fs.writeFile(out,JSON.stringify(value,null,2)+"\n","utf8");
process.stdout.write(out);
