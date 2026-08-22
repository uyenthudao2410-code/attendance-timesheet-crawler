import fs from "node:fs/promises";
import { extractAttendanceFromApiPayloads } from "../src/api-parser.mjs";
import { fetchDirectAttendancePayload } from "../src/direct-api-client.mjs";

const TZ = "Asia/Ho_Chi_Minh";
const ALLOWED_HOSTS = new Set(["h5.timemark.com", "h5.dayscamera.com"]);

function currentVNDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function validDateOrToday(value) {
  if (!value) return currentVNDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("TARGET_DATE must be YYYY-MM-DD");
  return value;
}

function loadPrivateRoster() {
  const raw = process.env.ATTENDANCE_ROSTER_JSON;
  if (!raw) throw new Error("Missing repository secret ATTENDANCE_ROSTER_JSON");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ATTENDANCE_ROSTER_JSON is not valid JSON");
  }

  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 50) {
    throw new Error("ATTENDANCE_ROSTER_JSON must be an array containing 1-50 employees");
  }

  return parsed.map((item, index) => {
    const name = String(item?.name || "").trim();
    const url = String(item?.url || "").trim();
    if (!name || !url) throw new Error(`Roster item ${index + 1} must contain name and url`);

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Roster item ${index + 1} contains an invalid URL`);
    }

    if (parsedUrl.protocol !== "https:" || !ALLOWED_HOSTS.has(parsedUrl.hostname)) {
      throw new Error(`Roster item ${index + 1} URL is outside the allowed attendance hosts`);
    }

    return { name, url };
  });
}

async function writeOutputs(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const body = Object.entries(values)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n");
  await fs.appendFile(outputPath, `${body}\n`, "utf8");
}

async function main() {
  const employees = loadPrivateRoster();
  const targetDate = validDateOrToday(process.env.TARGET_DATE?.trim());

  let directApiOkCount = 0;
  let browserFallbackCount = 0;

  for (const employee of employees) {
    try {
      const payload = await fetchDirectAttendancePayload(employee.url, targetDate);
      const parsed = extractAttendanceFromApiPayloads([payload], targetDate);
      if (parsed) directApiOkCount += 1;
      else browserFallbackCount += 1;
    } catch {
      browserFallbackCount += 1;
    }
  }

  const browserRequired = browserFallbackCount > 0;
  await writeOutputs({
    browser_required: browserRequired,
    direct_api_ok_count: directApiOkCount,
    browser_fallback_count: browserFallbackCount,
  });

  console.log(
    `Browser preflight finished: total=${employees.length} direct_api_ok=${directApiOkCount} browser_fallback_required=${browserFallbackCount}`,
  );
}

main().catch((error) => {
  console.error(`Browser preflight failed: ${String(error?.message || error || "Unknown error").slice(0, 300)}`);
  process.exitCode = 1;
});
