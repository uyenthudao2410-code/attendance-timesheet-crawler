import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = [".github", "scripts", "src", "test", "README.md", "package.json"];
const SKIP_NAMES = new Set(["node_modules", ".git"]);
const H5_URL = /https:\/\/h5\.(?:timemark|dayscamera)\.com\/attendance-management\?[^\s"'`]*/gi;
const ALLOWED_SYNTHETIC_DEVICE_IDS = new Set([
  "device-123",
  "device-456",
  "device-789",
  "device-history",
]);

function collectFiles(entry) {
  const full = path.join(ROOT, entry);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return [full];
  const out = [];
  for (const item of fs.readdirSync(full, { withFileTypes: true })) {
    if (SKIP_NAMES.has(item.name)) continue;
    const child = path.join(full, item.name);
    if (item.isDirectory()) out.push(...collectFiles(path.relative(ROOT, child)));
    else if (item.isFile()) out.push(child);
  }
  return out;
}

function committedRealRosterUrls(text) {
  const offenders = [];
  for (const match of text.matchAll(H5_URL)) {
    let deviceId = "";
    try {
      deviceId = new URL(match[0]).searchParams.get("deviceId") || "";
    } catch {
      offenders.push(match[0]);
      continue;
    }
    if (!ALLOWED_SYNTHETIC_DEVICE_IDS.has(deviceId)) offenders.push(match[0]);
  }
  return offenders;
}

test("real attendance H5 roster URLs are never committed", () => {
  const offenders = [];
  for (const root of SCAN_ROOTS) {
    for (const file of collectFiles(root)) {
      const text = fs.readFileSync(file, "utf8");
      if (committedRealRosterUrls(text).length > 0) offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Real employee H5 URLs must exist only in repository secret ATTENDANCE_ROSTER_JSON; committed copies found in: ${offenders.join(", ")}`,
  );
});
