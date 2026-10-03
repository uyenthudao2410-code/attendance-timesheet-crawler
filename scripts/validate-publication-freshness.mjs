import fs from "node:fs";
import path from "node:path";
import { validateFreshPublication } from "../src/snapshot-freshness.mjs";

const stage=String(process.argv[2]||"report").trim();
if(!["report","post"].includes(stage)) throw new Error("Usage: node scripts/validate-publication-freshness.mjs report|post");

const slot=String(process.env.ATTENDANCE_RUN_SLOT||"").trim();
const date=String(process.env.TARGET_DATE||"").trim();
if(!["morning_1230","daily_2105"].includes(slot)) throw new Error("Unsupported ATTENDANCE_RUN_SLOT");
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid TARGET_DATE");

const trigger=JSON.parse(fs.readFileSync(".github/attendance-rerun-trigger.json","utf8"));
const reportPath=path.join("output",`report-${slot}-${date}.json`);
const report=JSON.parse(fs.readFileSync(reportPath,"utf8"));

let imageMtimeMs=null;
if(stage==="post"){
  const imagePath=path.join("output",`attendance-${slot}-${date}.png`);
  const stat=fs.statSync(imagePath);
  imageMtimeMs=stat.mtimeMs;
}

const result=validateFreshPublication({trigger,report,imageMtimeMs});
console.log(JSON.stringify({stage,...result}));
if(process.env.GITHUB_ENV){
  fs.appendFileSync(process.env.GITHUB_ENV,[
    "ATTENDANCE_FRESHNESS_STAGE="+stage,
    "ATTENDANCE_FRESHNESS_VALIDATED_AT="+new Date().toISOString(),
    "ATTENDANCE_SOURCE_AGE_MS="+result.source_age_ms,
    "ATTENDANCE_REPORT_AGE_MS="+result.report_age_ms,
    "ATTENDANCE_IMAGE_AGE_MS="+(result.image_age_ms??""),
    "",
  ].join("\n"),"utf8");
}
