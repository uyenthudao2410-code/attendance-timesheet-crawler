import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildAiVisualRequest, validateAiVisualRequest } from "../src/attendance-ai-visual.mjs";

const slot=String(process.env.ATTENDANCE_RUN_SLOT||"").trim();
const date=String(process.env.TARGET_DATE||"").trim();
if(!["morning_1230","daily_2105"].includes(slot))throw new Error("Unsupported ATTENDANCE_RUN_SLOT");
if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Invalid TARGET_DATE");

const reportPath=path.join("output",`report-${slot}-${date}.json`);
const report=JSON.parse(await fs.readFile(reportPath,"utf8"));
const request=buildAiVisualRequest(report);
validateAiVisualRequest(request,report);

const jsonPath=path.join("output",`ai-visual-request-${slot}-${date}.json`);
const promptPath=path.join("output",`ai-visual-prompt-${slot}-${date}.txt`);
const serialized=JSON.stringify(request,null,2)+"\n";
await fs.writeFile(jsonPath,serialized,"utf8");
await fs.writeFile(promptPath,request.prompt+"\n","utf8");
const sha=crypto.createHash("sha256").update(serialized,"utf8").digest("hex");
if(process.env.GITHUB_ENV){
  await fs.appendFile(process.env.GITHUB_ENV,[
    "ATTENDANCE_AI_VISUAL_REQUEST_FILE="+jsonPath,
    "ATTENDANCE_AI_VISUAL_PROMPT_FILE="+promptPath,
    "ATTENDANCE_AI_VISUAL_REQUEST_SHA256="+sha,
    "ATTENDANCE_AI_VISUAL_SPEC_VERSION="+request.spec_version,
    "",
  ].join("\n"),"utf8");
}
console.log(`AI visual request ready: slot=${slot} date=${date} file=${jsonPath} sha256=${sha}`);
