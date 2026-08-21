import { chromium, devices } from "playwright";
import fs from "node:fs/promises";

const TZ = "Asia/Ho_Chi_Minh";
const API_HOST = "app.dayscamera.com";
const API_PATH = "/next/attendance/record/query/plain";
const ALLOWED_HOSTS = new Set(["h5.timemark.com", "h5.dayscamera.com"]);

function loadRoster() {
  const raw = process.env.ATTENDANCE_ROSTER_JSON;
  if (!raw) throw new Error("Missing ATTENDANCE_ROSTER_JSON");
  const roster = JSON.parse(raw);
  if (!Array.isArray(roster) || roster.length < 1 || roster.length > 50) {
    throw new Error("Invalid attendance roster");
  }
  return roster.map((item, index) => {
    const name = String(item?.name || "").trim();
    const url = String(item?.url || "").trim();
    const parsed = new URL(url);
    if (!name || parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
      throw new Error(`Invalid roster item ${index + 1}`);
    }
    return { name, url };
  });
}

function safeHeaders(headers) {
  return {
    accept: headers.accept || null,
    "content-type": headers["content-type"] || null,
    origin: headers.origin || null,
    referer: headers.referer || null,
  };
}

function summarizeBody(body) {
  const data = body?.data;
  const records = Array.isArray(data?.records) ? data.records : [];
  return {
    code: body?.code ?? null,
    data_status: data?.status ?? null,
    total_num: Number(data?.totalNum) || 0,
    records: records.map((record) => ({
      recordSeq: record?.recordSeq ?? null,
      state: record?.state ?? null,
      date: record?.date ?? null,
      time: record?.time ?? null,
      workingHours: record?.workingHours ?? null,
      address: record?.address ?? null,
      lat: record?.lat ?? null,
      lng: record?.lng ?? null,
      photoURL: record?.photoURL ?? null,
    })),
  };
}

async function captureForEmployee(context, employee) {
  const page = await context.newPage();
  const requests = [];
  const pending = [];

  page.on("response", (response) => {
    try {
      const url = new URL(response.url());
      if (url.hostname !== API_HOST || url.pathname !== API_PATH) return;
      const request = response.request();
      const metadata = {
        request: {
          method: request.method(),
          post_data: request.postData(),
          headers: safeHeaders(request.headers()),
        },
        response: {
          status: response.status(),
          body: null,
        },
      };
      requests.push(metadata);
      pending.push(
        response.json()
          .then((body) => { metadata.response.body = summarizeBody(body); })
          .catch(() => { metadata.response.body = { decode_error: true }; }),
      );
    } catch {
      // Diagnostic capture is best effort.
    }
  });

  try {
    await page.goto(employee.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4500);

    const timesheetUrl = new URL(employee.url);
    timesheetUrl.searchParams.set("attendanceType", "myTimesheet");
    if (timesheetUrl.toString() !== employee.url) {
      await page.goto(timesheetUrl.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(4500);
    }

    try {
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch {
      // H5 apps may keep long-lived requests open.
    }

    await Promise.allSettled(pending);
    const bodyText = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");

    return {
      name: employee.name,
      source_url: employee.url,
      final_url: page.url(),
      page_title: await page.title().catch(() => ""),
      api_requests: requests,
      body_text: bodyText,
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const roster = loadRoster();
  await fs.mkdir("diagnostic", { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    locale: "vi-VN",
    timezoneId: TZ,
  });

  const employees = [];
  try {
    for (const employee of roster) {
      employees.push(await captureForEmployee(context, employee));
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    timezone: TZ,
    employees,
  };
  await fs.writeFile("diagnostic/browser-network.json", JSON.stringify(report, null, 2), "utf8");

  const apiRequestCount = employees.reduce((sum, item) => sum + item.api_requests.length, 0);
  console.log(`Browser diagnostic finished: employees=${employees.length} api_requests=${apiRequestCount}`);
}

main().catch((error) => {
  console.error(`Browser diagnostic failed: ${String(error?.message || error).slice(0, 300)}`);
  process.exitCode = 1;
});
