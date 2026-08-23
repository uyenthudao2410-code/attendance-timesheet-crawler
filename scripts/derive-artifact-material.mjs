import crypto from "node:crypto";

const ALLOWED_HOSTS = new Set(["h5.timemark.com", "h5.dayscamera.com"]);
const raw = process.env.ATTENDANCE_ROSTER_JSON;
if (!raw) throw new Error("Missing ATTENDANCE_ROSTER_JSON");

let roster;
try {
  roster = JSON.parse(raw);
} catch {
  throw new Error("ATTENDANCE_ROSTER_JSON is not valid JSON");
}
if (!Array.isArray(roster) || roster.length !== 8) {
  throw new Error("ATTENDANCE_ROSTER_JSON must contain exactly 8 employees");
}

const canonicalRows = [];
const deviceIds = [];
for (const [index, item] of roster.entries()) {
  const name = String(item?.name || "").trim();
  const urlText = String(item?.url || "").trim();
  if (!name || !urlText) throw new Error(`Roster item ${index + 1} must contain name and url`);

  let url;
  try {
    url = new URL(urlText);
  } catch {
    throw new Error(`Roster item ${index + 1} has an invalid URL`);
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`Roster item ${index + 1} URL is outside the allowed attendance hosts`);
  }
  const deviceId = String(url.searchParams.get("deviceId") || "").trim();
  if (!deviceId) throw new Error(`Roster item ${index + 1} is missing deviceId`);
  deviceIds.push(deviceId);

  // Preserve the exact private name + full URL text and array order. Do not
  // reconstruct/reorder URL parameters: canonical skill URLs are byte-sensitive.
  canonicalRows.push(`${name}\t${urlText}`);
}

if (new Set(deviceIds).size !== deviceIds.length) {
  throw new Error("ATTENDANCE_ROSTER_JSON contains duplicate deviceId values");
}

const canonical = canonicalRows.join("\n");
const digest = (domain) =>
  crypto.createHash("sha256").update(`${domain}\n${canonical}`, "utf8").digest("hex");

const mode = process.argv[2];
if (mode === "key") {
  process.stdout.write(digest("attendance-artifact-key-v1"));
} else if (mode === "fingerprint") {
  process.stdout.write(digest("attendance-roster-fingerprint-v1"));
} else {
  throw new Error("Usage: node scripts/derive-artifact-material.mjs <key|fingerprint>");
}
