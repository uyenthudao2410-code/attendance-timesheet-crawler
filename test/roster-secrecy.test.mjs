import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = [".github", "scripts", "src", "test", "README.md", "package.json"];
const SKIP_NAMES = new Set(["node_modules", ".git"]);
const REAL_H5_URL = /https:\/\/h5\.(?:timemark|dayscamera)\.com\/attendance-management\?[^\s"'`]*deviceId=/i;

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

test("real attendance H5 roster URLs are never committed", () => {
  const offenders = [];
  for (const root of SCAN_ROOTS) {
    for (const file of collectFiles(root)) {
      const text = fs.readFileSync(file, "utf8");
      if (REAL_H5_URL.test(text)) offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Real employee H5 URLs must exist only in repository secret ATTENDANCE_ROSTER_JSON; committed copies found in: ${offenders.join(", ")}`,
  );
});
