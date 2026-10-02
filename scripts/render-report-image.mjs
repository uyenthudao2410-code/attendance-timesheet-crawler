import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  APPROVED_LAYOUT_VERSION,
  OVERVIEW_CANVAS,
  DETAIL_CANVAS,
  buildAttendanceReportSvgs,
} from "../src/attendance-image.mjs";

const slot=String(process.env.ATTENDANCE_RUN_SLOT||"").trim();
const targetDate=String(process.env.TARGET_DATE||"").trim();
if(!["morning_1230","daily_2105"].includes(slot))throw new Error("Unsupported ATTENDANCE_RUN_SLOT");
if(!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))throw new Error("Invalid TARGET_DATE");

const layout=JSON.parse(await fs.readFile(path.join("config","attendance-image-layout.json"),"utf8"));
if(layout.version!==APPROVED_LAYOUT_VERSION)throw new Error("Approved attendance image layout version mismatch");
if(layout.locked!==true||layout.strategy!=="mobile-first")throw new Error("Attendance V3 mobile-first layout is not locked");
if(layout.branding?.logo!==false)throw new Error("Approved attendance image layout must remain logo-free");
if(
  Number(layout.outputs?.overview?.width)!==OVERVIEW_CANVAS.width||
  Number(layout.outputs?.overview?.height)!==OVERVIEW_CANVAS.height||
  Number(layout.outputs?.detail?.width)!==DETAIL_CANVAS.width||
  Number(layout.outputs?.detail?.height)!==DETAIL_CANVAS.height
)throw new Error("Approved attendance V3 canvas changed");

const reportPath=path.join("output",`report-${slot}-${targetDate}.json`);
const report=JSON.parse(await fs.readFile(reportPath,"utf8"));
if(report?.kind!=="attendance_business_report"||report?.slot!==slot||report?.date!==targetDate||report?.timezone!=="Asia/Ho_Chi_Minh")throw new Error("Attendance report identity mismatch");
if(!Array.isArray(report?.employees)||report.employees.length!==8)throw new Error("Attendance V3 requires exactly 8 employees");

const svgs=buildAttendanceReportSvgs(report);
for(const svg of [svgs.overview,svgs.detail]){
  if(svg.includes("STACORP"))throw new Error("Approved attendance image must remain logo-free");
  if(/<image\b/i.test(svg)||/(?:href|src)=["']https?:\/\//i.test(svg))throw new Error("Approved attendance image must not load external content");
}

const outputs=[
  {
    key:"overview",
    svg:svgs.overview,
    canvas:OVERVIEW_CANVAS,
    file:path.join("output",`attendance-${slot}-${targetDate}-01-overview.png`)
  },
  {
    key:"detail",
    svg:svgs.detail,
    canvas:DETAIL_CANVAS,
    file:path.join("output",`attendance-${slot}-${targetDate}-02-detail.png`)
  }
];

const browser=await chromium.launch({headless:true});
try{
  for(const item of outputs){
    const context=await browser.newContext({viewport:item.canvas,deviceScaleFactor:1});
    const page=await context.newPage();
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;overflow:hidden;background:#f5fafe">'+item.svg+"</body></html>",{waitUntil:"load"});
    await page.screenshot({path:item.file,type:"png",fullPage:false});
    await context.close();
  }
}finally{await browser.close();}

const meta={};
for(const item of outputs){
  const bytes=await fs.readFile(item.file);
  if(bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")throw new Error(`${item.key} render is not PNG`);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(width!==item.canvas.width||height!==item.canvas.height)throw new Error(`${item.key} PNG dimensions mismatch: ${width}x${height}`);
  meta[item.key]={file:item.file,sha256:crypto.createHash("sha256").update(bytes).digest("hex"),width,height,bytes:bytes.length};
}

if(process.env.GITHUB_ENV){
  await fs.appendFile(process.env.GITHUB_ENV,[
    "ATTENDANCE_IMAGE_LAYOUT_VERSION="+APPROVED_LAYOUT_VERSION,
    "ATTENDANCE_IMAGE_COUNT=2",
    "ATTENDANCE_IMAGE_OVERVIEW_FILE="+meta.overview.file,
    "ATTENDANCE_IMAGE_OVERVIEW_SHA256="+meta.overview.sha256,
    "ATTENDANCE_IMAGE_OVERVIEW_WIDTH="+meta.overview.width,
    "ATTENDANCE_IMAGE_OVERVIEW_HEIGHT="+meta.overview.height,
    "ATTENDANCE_IMAGE_DETAIL_FILE="+meta.detail.file,
    "ATTENDANCE_IMAGE_DETAIL_SHA256="+meta.detail.sha256,
    "ATTENDANCE_IMAGE_DETAIL_WIDTH="+meta.detail.width,
    "ATTENDANCE_IMAGE_DETAIL_HEIGHT="+meta.detail.height,
    "",
  ].join("\n"),"utf8");
}
console.log(JSON.stringify({layout:APPROVED_LAYOUT_VERSION,slot,date:targetDate,images:meta}));
