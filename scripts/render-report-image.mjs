import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  APPROVED_LAYOUT_VERSION,
  CANVAS,
  buildAttendanceReportSvg,
} from "../src/attendance-image.mjs";

const slot = String(process.env.ATTENDANCE_RUN_SLOT || "").trim();
const targetDate = String(process.env.TARGET_DATE || "").trim();

if (!["morning_1230", "daily_2105"].includes(slot)) {
  throw new Error("Unsupported ATTENDANCE_RUN_SLOT");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  throw new Error("Invalid TARGET_DATE");
}

const layoutPath = path.join("config", "attendance-image-layout.json");
const layout = JSON.parse(await fs.readFile(layoutPath, "utf8"));
if (layout.version !== APPROVED_LAYOUT_VERSION) {
  throw new Error("Approved attendance image layout version mismatch");
}
if (layout.locked !== true || layout.status !== "approved-production") {
  throw new Error("Attendance image layout is not production-locked");
}
if (layout.branding?.logo !== false) {
  throw new Error("Approved attendance image layout must remain logo-free");
}
if (
  Number(layout.canvas?.width) !== CANVAS.width ||
  Number(layout.canvas?.height) !== CANVAS.height ||
  String(layout.canvas?.format || "").toUpperCase() !== "PNG"
) {
  throw new Error("Approved attendance image canvas changed");
}

const reportPath = path.join("output", "report-" + slot + "-" + targetDate + ".json");
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
if (
  report?.kind !== "attendance_business_report" ||
  report?.slot !== slot ||
  report?.date !== targetDate ||
  report?.timezone !== "Asia/Ho_Chi_Minh"
) {
  throw new Error("Attendance report identity does not match render request");
}
if (!Array.isArray(report?.employees) || report.employees.length !== 8) {
  throw new Error("Approved attendance image requires exactly 8 employees");
}

const svg = buildAttendanceReportSvg(report);
if (svg.includes("STACORP")) {
  throw new Error("Approved attendance image must not contain a STACORP logo/wordmark");
}

const outputPath = path.join("output", "attendance-" + slot + "-" + targetDate + ".png");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: CANVAS.width, height: CANVAS.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;overflow:hidden;background:#f8fbff">' +
      svg +
      "</body></html>",
    { waitUntil: "load" },
  );
  await page.screenshot({
    path: outputPath,
    type: "png",
    fullPage: false,
  });
  await context.close();
} finally {
  await browser.close();
}

const bytes = await fs.readFile(outputPath);
const signature = bytes.subarray(0, 8).toString("hex");
if (signature !== "89504e470d0a1a0a") {
  throw new Error("Attendance image render is not a PNG");
}
const imageSha256 = crypto.createHash("sha256").update(bytes).digest("hex");

const githubEnv = process.env.GITHUB_ENV;
if (githubEnv) {
  await fs.appendFile(
    githubEnv,
    [
      "ATTENDANCE_IMAGE_FILE=" + outputPath,
      "ATTENDANCE_IMAGE_SHA256=" + imageSha256,
      "ATTENDANCE_IMAGE_LAYOUT_VERSION=" + APPROVED_LAYOUT_VERSION,
      "",
    ].join("\n"),
    "utf8",
  );
}

console.log(
  "Approved attendance image ready: layout=" +
    APPROVED_LAYOUT_VERSION +
    " slot=" +
    slot +
    " date=" +
    targetDate +
    " file=" +
    outputPath +
    " sha256=" +
    imageSha256,
);
