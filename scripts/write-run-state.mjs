import fs from "node:fs/promises";
import path from "node:path";

const ALLOWED_SLOTS = new Set(["morning_1230", "daily_2105", "final_0645"]);
const slot = String(process.env.ATTENDANCE_RUN_SLOT || "").trim();
const targetDate = String(process.env.TARGET_DATE || "").trim();
const artifactId = String(process.env.ARTIFACT_ID || "").trim();
const artifactName = String(process.env.ARTIFACT_NAME || "").trim();
const fingerprint = String(process.env.ATTENDANCE_ROSTER_FINGERPRINT || "").trim();

if (!ALLOWED_SLOTS.has(slot)) throw new Error("Unsupported ATTENDANCE_RUN_SLOT");
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error("Invalid TARGET_DATE");
if (!/^\d+$/.test(artifactId)) throw new Error("Invalid ARTIFACT_ID");
if (!artifactName) throw new Error("Missing ARTIFACT_NAME");
if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Invalid roster fingerprint");

const state = {
  schema_version: 1,
  run_id: String(process.env.GITHUB_RUN_ID || ""),
  run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT || "1"),
  slot,
  target_date: targetDate,
  artifact_id: artifactId,
  artifact_name: artifactName,
  roster_fingerprint: fingerprint,
  completed_at: new Date().toISOString(),
};
if (!/^\d+$/.test(state.run_id)) throw new Error("Invalid GITHUB_RUN_ID");

const dir = path.join(".github", "attendance-state");
await fs.mkdir(dir, { recursive: true });
const outputPath = path.join(dir, `${slot}.json`);
await fs.writeFile(outputPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
process.stdout.write(outputPath);
