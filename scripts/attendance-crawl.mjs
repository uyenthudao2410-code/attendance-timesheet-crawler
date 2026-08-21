import { chromium, devices } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { extractAttendance } from "../src/parser.mjs";

const TZ = "Asia/Ho_Chi_Minh";
const DEBUG_MODE = String(process.env.DEBUG_MODE || "false").toLowerCase() === "true";
const ALLOWED_HOSTS = new Set(["h5.timemark.com", "h5.dayscamera.com"]);

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

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function safeError(error) {
  return String(error?.message || error || "Unknown error")
    .replace(/https?:\/\/\S+/gi, "[URL_REDACTED]")
    .replace(/deviceId=[^&\s]+/gi, "deviceId=[REDACTED]")
    .slice(0, 600);
}

async function getReadableText(page) {
  const chunks = [];
  for (const frame of page.frames()) {
    try {
      const text = await frame.locator("body").innerText({ timeout: 5000 });
      if (text?.trim()) chunks.push(text.trim());
    } catch {
      // Cross-origin or transient frames can be unreadable; keep other frame text.
    }
  }
  return [...new Set(chunks)].join("\n\n");
}

function looksLikeTimesheet(text) {
  return /(My\s*Timesheet|Bảng\s*công|Lịch\s*sử\s*chấm\s*công|Vào\s*ca|Tan\s*ca)/i.test(text);
}

async function navigateToReadOnlyTimesheet(page, originalUrl) {
  let text = await getReadableText(page);
  if (looksLikeTimesheet(text)) return { method: "original_url", text };

  const safeNavigationLabels = [/My\s*Timesheet/i, /Bảng\s*công/i, /Lịch\s*sử/i, /Timesheet/i];
  for (const label of safeNavigationLabels) {
    for (const role of ["link", "button"]) {
      try {
        const locator = page.getByRole(role, { name: label }).first();
        if (await locator.isVisible({ timeout: 800 })) {
          await locator.click({ timeout: 3000 });
          await page.waitForTimeout(2500);
          text = await getReadableText(page);
          if (looksLikeTimesheet(text)) return { method: "safe_ui_navigation", text };
        }
      } catch {
        // Try the next explicitly read-only navigation label.
      }
    }
  }

  // Read-only fallback: keep every original parameter and switch only the view selector.
  try {
    const fallback = new URL(originalUrl);
    fallback.searchParams.set("attendanceType", "myTimesheet");
    await page.goto(fallback.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(5000);
    text = await getReadableText(page);
    return { method: "timesheet_view_fallback", text };
  } catch {
    return { method: "no_timesheet_navigation", text };
  }
}

async function collectVerificationSignals(page, text) {
  let imageCount = 0;
  let mapLikeCount = 0;
  try {
    imageCount = await page.locator("img").count();
    mapLikeCount = await page.locator('iframe[src*="map" i], [class*="map" i], [id*="map" i]').count();
  } catch {
    // Signals are advisory only.
  }
  return {
    photo_element_count: imageCount,
    map_element_count: mapLikeCount,
    location_text_present: /(Địa\s*chỉ|Vị\s*trí|Location|Hà\s*Nội|Phường|P\.|Quận|Q\.|Huyện)/i.test(text),
  };
}

async function processEmployee(context, employee, targetDate, debugDir) {
  const page = await context.newPage();
  const jsonEndpoints = new Set();
  page.on("response", (response) => {
    try {
      const headers = response.headers();
      if ((headers["content-type"] || "").includes("application/json")) {
        const url = new URL(response.url());
        jsonEndpoints.add(`${url.origin}${url.pathname}`);
      }
    } catch {
      // Network metadata is best-effort and never blocks attendance extraction.
    }
  });

  try {
    const response = await page.goto(employee.url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(5500);
    try {
      await page.waitForLoadState("networkidle", { timeout: 8000 });
    } catch {
      // H5 SPAs may keep network connections alive indefinitely.
    }

    const navigation = await navigateToReadOnlyTimesheet(page, employee.url);
    const text = navigation.text || (await getReadableText(page));
    if (!text.trim()) throw new Error("Rendered page contains no readable text");

    const attendance = extractAttendance(text, targetDate, {
      allowTodayLabel: targetDate === currentVNDate(),
    });
    const verification = await collectVerificationSignals(page, text);

    if (DEBUG_MODE) {
      const slug = slugify(employee.name);
      await fs.writeFile(path.join(debugDir, `${slug}.txt`), text, "utf8");
      await page.screenshot({ path: path.join(debugDir, `${slug}.png`), fullPage: true });
    }

    return {
      name: employee.name,
      access_ok: true,
      http_status: response?.status() ?? null,
      page_title: await page.title(),
      navigation_method: navigation.method,
      ...attendance,
      verification,
      json_endpoints: [...jsonEndpoints].slice(0, 20),
    };
  } catch (error) {
    if (DEBUG_MODE) {
      try {
        const slug = slugify(employee.name);
        await page.screenshot({ path: path.join(debugDir, `${slug}-error.png`), fullPage: true });
      } catch {
        // Do not mask the original error.
      }
    }
    return {
      name: employee.name,
      access_ok: false,
      status: "technical_error",
      error: safeError(error),
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const employees = loadPrivateRoster();
  const targetDate = validDateOrToday(process.env.TARGET_DATE?.trim());
  const outputDir = "output";
  const debugDir = "debug";
  await fs.mkdir(outputDir, { recursive: true });
  if (DEBUG_MODE) await fs.mkdir(debugDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    locale: "vi-VN",
    timezoneId: TZ,
  });

  const results = [];
  try {
    for (const employee of employees) {
      results.push(await processEmployee(context, employee, targetDate, debugDir));
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const report = {
    schema_version: 1,
    date: targetDate,
    timezone: TZ,
    generated_at: new Date().toISOString(),
    employees: results,
  };

  const outputPath = path.join(outputDir, `attendance-${targetDate}.json`);
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

  const counts = {
    total: results.length,
    complete: results.filter((item) => item.status === "complete").length,
    incomplete: results.filter((item) => item.status === "incomplete").length,
    date_not_found: results.filter((item) => item.status === "date_not_found").length,
    technical_error: results.filter((item) => item.status === "technical_error").length,
  };
  console.log(`Attendance crawl finished: total=${counts.total} complete=${counts.complete} incomplete=${counts.incomplete} date_not_found=${counts.date_not_found} technical_error=${counts.technical_error}`);
}

main().catch((error) => {
  console.error(`Attendance crawler failed: ${safeError(error)}`);
  process.exitCode = 1;
});
