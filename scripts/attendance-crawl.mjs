import { chromium, devices } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import {
  extractAttendanceFromApiPayloads,
  summarizeAttendanceApiHistory,
} from "../src/api-parser.mjs";
import {
  fetchDirectAttendanceHistoryPayload,
  fetchDirectAttendancePayload,
} from "../src/direct-api-client.mjs";
import { extractAttendance } from "../src/parser.mjs";

const TZ = "Asia/Ho_Chi_Minh";
const DEBUG_MODE = String(process.env.DEBUG_MODE || "false").toLowerCase() === "true";
const ALLOWED_HOSTS = new Set(["h5.timemark.com", "h5.dayscamera.com"]);
const ATTENDANCE_API_HOST = "app.dayscamera.com";
const ATTENDANCE_API_PATH = "/next/attendance/record/query/plain";

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
    source: "rendered_dom",
    photo_element_count: imageCount,
    map_element_count: mapLikeCount,
    location_text_present: /(Địa\s*chỉ|Vị\s*trí|Location|Hà\s*Nội|Phường|P\.|Quận|Q\.|Huyện)/i.test(text),
  };
}

function collectApiVerification(attendance) {
  const evidence = [attendance?.morning?.evidence, attendance?.afternoon?.evidence].filter(Boolean);
  const photoPresent = evidence.some((item) => item.in_photo_present || item.out_photo_present);
  const locationPresent = evidence.some((item) => item.in_address || item.out_address);
  const coordinatesPresent = evidence.some(
    (item) =>
      (item.in_lat != null && item.in_lng != null) ||
      (item.out_lat != null && item.out_lng != null),
  );
  return {
    source: "attendance_api",
    photo_evidence_present: photoPresent,
    location_evidence_present: locationPresent,
    coordinate_evidence_present: coordinatesPresent,
  };
}

function safeRequestMetadata(response) {
  const request = response.request();
  const headers = request.headers();
  return {
    method: request.method(),
    url: request.url(),
    post_data: request.postData(),
    headers: {
      accept: headers.accept || null,
      "content-type": headers["content-type"] || null,
      origin: headers.origin || null,
      referer: headers.referer || null,
    },
  };
}

function compactSession(session) {
  if (!session) return null;
  return { in: session.in ?? null, out: session.out ?? null, minutes: session.minutes ?? null };
}

function compareParsers(apiAttendance, domAttendance) {
  if (!apiAttendance) return null;
  const apiComparable = {
    status: apiAttendance.status,
    morning: compactSession(apiAttendance.morning),
    afternoon: compactSession(apiAttendance.afternoon),
    total_minutes: apiAttendance.total_minutes,
  };
  const domComparable = {
    status: domAttendance.status,
    morning: compactSession(domAttendance.morning),
    afternoon: compactSession(domAttendance.afternoon),
    total_minutes: domAttendance.total_minutes,
  };
  return {
    agrees: JSON.stringify(apiComparable) === JSON.stringify(domComparable),
    api: apiComparable,
    dom: domComparable,
  };
}

async function saveEncryptedDebugJson(debugDir, employeeName, suffix, value) {
  if (!DEBUG_MODE) return;
  const slug = slugify(employeeName);
  await fs.writeFile(path.join(debugDir, `${slug}-${suffix}.json`), JSON.stringify(value, null, 2), "utf8");
}

async function tryDirectApi(employee, targetDate, debugDir) {
  try {
    const payload = await fetchDirectAttendancePayload(employee.url, targetDate);
    await saveEncryptedDebugJson(debugDir, employee.name, "direct-api", payload);
    const parsed = extractAttendanceFromApiPayloads([payload], targetDate);
    if (!parsed) return { ok: false, reason: "invalid_api_envelope" };

    let attendance = { ...parsed, data_source: "attendance_api_direct" };
    let historyPayload = null;

    if (parsed.status === "date_not_found") {
      try {
        historyPayload = await fetchDirectAttendanceHistoryPayload(employee.url, targetDate);
        await saveEncryptedDebugJson(debugDir, employee.name, "direct-api-history", historyPayload);
        const historySummary = summarizeAttendanceApiHistory([historyPayload], targetDate);
        const historyParsed = extractAttendanceFromApiPayloads([historyPayload], targetDate);

        if (historyParsed && historyParsed.status !== "date_not_found") {
          attendance = {
            ...historyParsed,
            data_source: "attendance_api_direct_history",
            device_history: {
              ...historySummary,
              interpretation: "target_date_recovered_from_history_query",
            },
          };
        } else {
          attendance = {
            ...attendance,
            device_history: historySummary
              ? {
                  ...historySummary,
                  interpretation: historySummary.history_record_count > 0
                    ? "history_exists_but_no_target_date"
                    : "device_history_empty",
                }
              : {
                  history_record_count: null,
                  latest_record_date: null,
                  earliest_record_date: null,
                  target_date_present: null,
                  interpretation: "history_check_unavailable",
                },
          };
        }
      } catch (historyError) {
        attendance = {
          ...attendance,
          device_history: {
            history_record_count: null,
            latest_record_date: null,
            earliest_record_date: null,
            target_date_present: null,
            interpretation: "history_check_error",
            error: safeError(historyError),
          },
        };
      }
    }

    return {
      ok: true,
      payload,
      historyPayload,
      attendance,
    };
  } catch (error) {
    if (DEBUG_MODE) {
      await saveEncryptedDebugJson(debugDir, employee.name, "direct-api-error", { error: safeError(error) });
    }
    return { ok: false, reason: safeError(error) };
  }
}

async function processEmployee(getBrowserContext, employee, targetDate, debugDir) {
  const direct = await tryDirectApi(employee, targetDate, debugDir);
  if (direct.ok) {
    const attendance = direct.attendance;
    return {
      name: employee.name,
      access_ok: true,
      http_status: direct.payload.status,
      page_title: null,
      navigation_method: "direct_api",
      ...attendance,
      verification: collectApiVerification(attendance),
      attendance_api_payload_count: direct.historyPayload ? 2 : 1,
      parser_crosscheck_agrees: null,
      json_endpoints: [direct.payload.endpoint],
    };
  }

  const context = await getBrowserContext();
  const page = await context.newPage();
  const jsonEndpoints = new Set();
  const attendanceApiPayloads = [];
  const apiResponsePromises = [];

  page.on("response", (response) => {
    try {
      const headers = response.headers();
      if (!(headers["content-type"] || "").includes("application/json")) return;
      const url = new URL(response.url());
      jsonEndpoints.add(`${url.origin}${url.pathname}`);

      if (url.hostname === ATTENDANCE_API_HOST && url.pathname === ATTENDANCE_API_PATH) {
        const request = DEBUG_MODE ? safeRequestMetadata(response) : null;
        const pending = response
          .json()
          .then((body) => {
            attendanceApiPayloads.push({
              status: response.status(),
              endpoint: `${url.origin}${url.pathname}`,
              ...(request ? { request } : {}),
              body,
            });
          })
          .catch(() => {
            // The DOM parser remains the safe fallback if one response cannot be decoded.
          });
        apiResponsePromises.push(pending);
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
    await page.waitForTimeout(700);
    await Promise.allSettled([...apiResponsePromises]);

    const text = navigation.text || (await getReadableText(page));
    if (!text.trim()) throw new Error("Rendered page contains no readable text");

    const domAttendance = extractAttendance(text, targetDate, {
      allowTodayLabel: targetDate === currentVNDate(),
    });
    const apiAttendanceRaw = extractAttendanceFromApiPayloads(attendanceApiPayloads, targetDate);
    const apiAttendance = apiAttendanceRaw
      ? { ...apiAttendanceRaw, data_source: "attendance_api_browser" }
      : null;
    const attendance = apiAttendance ?? { ...domAttendance, data_source: "rendered_dom" };
    const parserCrosscheck = compareParsers(apiAttendance, domAttendance);
    const verification = apiAttendance
      ? collectApiVerification(apiAttendance)
      : await collectVerificationSignals(page, text);

    if (DEBUG_MODE) {
      const slug = slugify(employee.name);
      await fs.writeFile(path.join(debugDir, `${slug}.txt`), text, "utf8");
      await page.screenshot({ path: path.join(debugDir, `${slug}.png`), fullPage: true });
      if (attendanceApiPayloads.length) {
        await saveEncryptedDebugJson(debugDir, employee.name, "attendance-api", attendanceApiPayloads);
      }
      if (parserCrosscheck) {
        await saveEncryptedDebugJson(debugDir, employee.name, "parser-crosscheck", parserCrosscheck);
      }
    }

    return {
      name: employee.name,
      access_ok: true,
      http_status: response?.status() ?? null,
      page_title: await page.title(),
      navigation_method: navigation.method,
      direct_api_fallback_reason: direct.reason,
      ...attendance,
      verification,
      attendance_api_payload_count: attendanceApiPayloads.length,
      parser_crosscheck_agrees: parserCrosscheck?.agrees ?? null,
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
      direct_api_fallback_reason: direct.reason,
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

  let browser = null;
  let context = null;
  const getBrowserContext = async () => {
    if (context) return context;
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      ...devices["iPhone 13"],
      locale: "vi-VN",
      timezoneId: TZ,
    });
    return context;
  };

  const results = [];
  try {
    for (const employee of employees) {
      results.push(await processEmployee(getBrowserContext, employee, targetDate, debugDir));
    }
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }

  const report = {
    schema_version: 5,
    date: targetDate,
    timezone: TZ,
    generated_at: new Date().toISOString(),
    employees: results,
  };

  const outputPath = path.join(outputDir, `attendance-${targetDate}.json`);
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

  const counts = {
    total: results.length,
    direct_api: results.filter((item) => item.data_source === "attendance_api_direct").length,
    direct_api_history: results.filter((item) => item.data_source === "attendance_api_direct_history").length,
    browser_api: results.filter((item) => item.data_source === "attendance_api_browser").length,
    dom: results.filter((item) => item.data_source === "rendered_dom").length,
    complete: results.filter((item) => item.status === "complete").length,
    incomplete: results.filter((item) => item.status === "incomplete").length,
    review_required: results.filter((item) => item.status === "review_required").length,
    date_not_found: results.filter((item) => item.status === "date_not_found").length,
    technical_error: results.filter((item) => item.status === "technical_error").length,
  };
  console.log(
    `Attendance crawl finished: total=${counts.total} direct_api=${counts.direct_api} direct_api_history=${counts.direct_api_history} browser_api=${counts.browser_api} dom=${counts.dom} complete=${counts.complete} incomplete=${counts.incomplete} review_required=${counts.review_required} date_not_found=${counts.date_not_found} technical_error=${counts.technical_error}`,
  );
}

main().catch((error) => {
  console.error(`Attendance crawler failed: ${safeError(error)}`);
  process.exitCode = 1;
});