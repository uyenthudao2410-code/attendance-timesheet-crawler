import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildAttendanceBusinessReport } from "../src/report-builder.mjs";

const TZ = "Asia/Ho_Chi_Minh";
const slot = String(process.env.ATTENDANCE_RUN_SLOT || "").trim();
const targetDate = String(process.env.TARGET_DATE || "").trim();

if (!new Set(["morning_1230", "daily_2105"]).has(slot)) {
  throw new Error("ATTENDANCE_RUN_SLOT must be morning_1230 or daily_2105");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error("TARGET_DATE must be YYYY-MM-DD");

const rosterRaw = process.env.ATTENDANCE_ROSTER_JSON;
if (!rosterRaw) throw new Error("Missing repository secret ATTENDANCE_ROSTER_JSON");
let roster;
try {
  roster = JSON.parse(rosterRaw);
} catch {
  throw new Error("ATTENDANCE_ROSTER_JSON is not valid JSON");
}
if (!Array.isArray(roster) || roster.length !== 8) {
  throw new Error("ATTENDANCE_ROSTER_JSON must contain exactly 8 employees");
}
const expectedNames = roster.map((item, index) => {
  const name = String(item?.name || "").trim();
  if (!name) throw new Error(`Roster item ${index + 1} has no name`);
  return name;
});
if (new Set(expectedNames).size !== expectedNames.length) throw new Error("Roster contains duplicate employee names");

const rawPath = path.join("output", `attendance-${targetDate}.json`);
const rawReport = JSON.parse(await fs.readFile(rawPath, "utf8"));
if (rawReport.date !== targetDate || rawReport.timezone !== TZ) {
  throw new Error("Raw attendance report date/timezone does not match requested report");
}

const businessReport = buildAttendanceBusinessReport(rawReport, slot, expectedNames);
const reportPath = path.join("output", `report-${slot}-${targetDate}.json`);
const serialized = `${JSON.stringify(businessReport, null, 2)}\n`;
await fs.writeFile(reportPath, serialized, "utf8");
const reportSha256 = crypto.createHash("sha256").update(serialized, "utf8").digest("hex");

const githubEnv = process.env.GITHUB_ENV;
if (githubEnv) {
  await fs.appendFile(
    githubEnv,
    `ATTENDANCE_REPORT_FILE=${reportPath}\nATTENDANCE_REPORT_SHA256=${reportSha256}\n`,
    "utf8",
  );
}

console.log(
  `Attendance business report ready: slot=${slot} date=${targetDate} employees=${businessReport.employee_count} file=${reportPath} sha256=${reportSha256}`,
);
