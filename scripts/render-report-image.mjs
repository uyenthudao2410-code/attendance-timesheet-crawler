import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { APPROVED_LAYOUT_VERSION, CANVAS, buildAttendanceReportSvg } from "../src/attendance-image.mjs";

const slot=String(process.env.ATTENDANCE_RUN_SLOT||"").trim();
const targetDate=String(process.env.TARGET_DATE||"").trim();
if(!["morning_1230","daily_2105"].includes(slot))throw new Error("Unsupported ATTENDANCE_RUN_SLOT");
if(!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))throw new Error("Invalid TARGET_DATE");

const layout=JSON.parse(await fs.readFile(path.join("config","attendance-image-layout.json"),"utf8"));
if(layout.version!==APPROVED_LAYOUT_VERSION)throw new Error("Approved attendance image layout version mismatch");
if(layout.locked!==true||layout.strategy!=="mockup-fidelity-mobile-first")throw new Error("Attendance V4 layout is not locked");
if(layout.branding?.logo!==false)throw new Error("Approved attendance image layout must remain logo-free");
if(Number(layout.canvas?.width)!==CANVAS.width||Number(layout.canvas?.height)!==CANVAS.height)throw new Error("Approved attendance V4 canvas changed");

const reportPath=path.join("output",`report-${slot}-${targetDate}.json`);
const report=JSON.parse(await fs.readFile(reportPath,"utf8"));
if(report?.kind!=="attendance_business_report"||report?.slot!==slot||report?.date!==targetDate||report?.timezone!=="Asia/Ho_Chi_Minh")throw new Error("Attendance report identity mismatch");
if(!Array.isArray(report?.employees)||report.employees.length!==8)throw new Error("Attendance V4 requires exactly 8 employees");

const svg=buildAttendanceReportSvg(report);
if(svg.includes("STACORP"))throw new Error("Approved attendance image must remain logo-free");
if(/<image\b/i.test(svg)||/(?:href|src)=["']https?:\/\//i.test(svg))throw new Error("Approved attendance image must not load external content");

const outputPath=path.join("output",`attendance-${slot}-${targetDate}.png`);
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:CANVAS,deviceScaleFactor:1});
  const page=await context.newPage();
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;overflow:hidden;background:#f7fbff">'+svg+"</body></html>",{waitUntil:"load"});
  await page.screenshot({path:outputPath,type:"png",fullPage:false});
  await context.close();
}finally{await browser.close();}

const bytes=await fs.readFile(outputPath);
if(bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")throw new Error("Attendance V4 render is not PNG");
const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
if(width!==CANVAS.width||height!==CANVAS.height)throw new Error(`Attendance V4 PNG dimensions mismatch: ${width}x${height}`);
const sha256=crypto.createHash("sha256").update(bytes).digest("hex");
if(process.env.GITHUB_ENV)await fs.appendFile(process.env.GITHUB_ENV,[
  "ATTENDANCE_IMAGE_LAYOUT_VERSION="+APPROVED_LAYOUT_VERSION,
  "ATTENDANCE_IMAGE_COUNT=1",
  "ATTENDANCE_IMAGE_FILE="+outputPath,
  "ATTENDANCE_IMAGE_SHA256="+sha256,
  "ATTENDANCE_IMAGE_WIDTH="+width,
  "ATTENDANCE_IMAGE_HEIGHT="+height,
  "",
].join("\n"),"utf8");
console.log(JSON.stringify({layout:APPROVED_LAYOUT_VERSION,slot,date:targetDate,file:outputPath,sha256,width,height,bytes:bytes.length}));
