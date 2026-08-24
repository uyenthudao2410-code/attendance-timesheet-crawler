import fs from "node:fs/promises";
import path from "node:path";

const ALLOWED_SLOTS = new Set(["morning_1230", "daily_2105"]);
const slot = String(process.env.ATTENDANCE_RUN_SLOT || "").trim();
const targetDate = String(process.env.TARGET_DATE || "").trim();
const requestId = String(process.env.ATTENDANCE_REQUEST_ID || "").trim();
const requestedAt = String(process.env.ATTENDANCE_REQUESTED_AT || "").trim();
const crawlCompletedAt = String(process.env.ATTENDANCE_CRAWL_COMPLETED_AT || "").trim();
const crawlEmployeeCount = Number(process.env.ATTENDANCE_CRAWL_EMPLOYEE_COUNT || "0");
const triggerCommitSha = String(process.env.GITHUB_SHA || "").trim();
const artifactId = String(process.env.ARTIFACT_ID || "").trim();
const artifactName = String(process.env.ARTIFACT_NAME || "").trim();
const fingerprint = String(process.env.ATTENDANCE_ROSTER_FINGERPRINT || "").trim();
const identityFingerprint = String(process.env.ATTENDANCE_IDENTITY_FINGERPRINT || "").trim();
const reportFile = String(process.env.ATTENDANCE_REPORT_FILE || "").trim();
const reportSha256 = String(process.env.ATTENDANCE_REPORT_SHA256 || "").trim();

if (!ALLOWED_SLOTS.has(slot)) throw new Error("Unsupported ATTENDANCE_RUN_SLOT");
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error("Invalid TARGET_DATE");
if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/.test(requestId)) throw new Error("Invalid ATTENDANCE_REQUEST_ID");
if (!Number.isFinite(Date.parse(requestedAt))) throw new Error("Invalid ATTENDANCE_REQUESTED_AT");
if (!Number.isFinite(Date.parse(crawlCompletedAt))) throw new Error("Invalid ATTENDANCE_CRAWL_COMPLETED_AT");
if (Date.parse(crawlCompletedAt) + 1000 < Date.parse(requestedAt)) {
  throw new Error("Crawl completion predates the current request");
}
if (crawlEmployeeCount !== 8) throw new Error("Crawl completion barrier did not confirm all 8 employees");
if (!/^[a-f0-9]{40}$/.test(triggerCommitSha)) throw new Error("Invalid trigger commit SHA");
if (!/^\d+$/.test(artifactId)) throw new Error("Invalid ARTIFACT_ID");
if (!artifactName) throw new Error("Missing ARTIFACT_NAME");
if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Invalid roster fingerprint");
if (!/^[a-f0-9]{64}$/.test(identityFingerprint)) throw new Error("Invalid identity fingerprint");
if (reportFile !== `output/report-${slot}-${targetDate}.json`) throw new Error("Invalid ATTENDANCE_REPORT_FILE");
if (!/^[a-f0-9]{64}$/.test(reportSha256)) throw new Error("Invalid ATTENDANCE_REPORT_SHA256");

const state = {
  schema_version: 4,
  run_id: String(process.env.GITHUB_RUN_ID || ""),
  run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT || "1"),
  request_id: requestId,
  requested_at: requestedAt,
  trigger_commit_sha: triggerCommitSha,
  slot,
  target_date: targetDate,
  crawl_complete: true,
  crawl_employee_count: crawlEmployeeCount,
  crawl_completed_at: crawlCompletedAt,
  artifact_id: artifactId,
  artifact_name: artifactName,
  roster_fingerprint: fingerprint,
  identity_fingerprint: identityFingerprint,
  encryption: "rsa-oaep-sha256+aes-256-cbc-pbkdf2-200000",
  report_file: reportFile,
  report_sha256: reportSha256,
  completed_at: new Date().toISOString(),
};
if (!/^\d+$/.test(state.run_id)) throw new Error("Invalid GITHUB_RUN_ID");
if (Date.parse(state.completed_at) < Date.parse(state.crawl_completed_at)) {
  throw new Error("State completion predates crawl completion");
}

const dir = path.join(".github", "attendance-state");
await fs.mkdir(dir, { recursive: true });
const outputPath = path.join(dir, `${slot}.json`);
await fs.writeFile(outputPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
process.stdout.write(outputPath);
