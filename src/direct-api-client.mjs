const API_URL = "https://app.dayscamera.com/next/attendance/record/query/plain";
const VIETNAM_OFFSET = "+07:00";
const DAY_SECONDS = 24 * 60 * 60;

export function extractDeviceId(attendanceUrl) {
  const parsed = new URL(attendanceUrl);
  const deviceId = parsed.searchParams.get("deviceId")?.trim();
  if (!deviceId) throw new Error("Attendance URL has no deviceId");
  return deviceId;
}

export function targetDateEpochRange(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ""))) {
    throw new Error("Target date must be YYYY-MM-DD");
  }
  const startTimestamp = Math.floor(Date.parse(`${isoDate}T00:00:00${VIETNAM_OFFSET}`) / 1000);
  if (!Number.isFinite(startTimestamp)) throw new Error("Invalid target date");
  return {
    startTimestamp,
    endTimestamp: startTimestamp + DAY_SECONDS - 1,
  };
}

export function targetDateHistoryEpochRange(isoDate, days = 45) {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("History days must be an integer between 1 and 90");
  }
  const target = targetDateEpochRange(isoDate);
  return {
    startTimestamp: target.startTimestamp - (days - 1) * DAY_SECONDS,
    endTimestamp: target.endTimestamp,
  };
}

function buildApiRequest(attendanceUrl, range, pageSize) {
  const sourceUrl = new URL(attendanceUrl);
  const deviceId = extractDeviceId(attendanceUrl);
  return {
    url: API_URL,
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      referer: `${sourceUrl.origin}/`,
    },
    body: {
      device_id: deviceId,
      startTimestamp: range.startTimestamp,
      endTimestamp: range.endTimestamp,
      page: 1,
      pageSize,
    },
  };
}

export function buildDirectApiRequest(attendanceUrl, isoDate) {
  return buildApiRequest(attendanceUrl, targetDateEpochRange(isoDate), 100);
}

export function buildDirectApiHistoryRequest(attendanceUrl, isoDate, days = 45) {
  return buildApiRequest(attendanceUrl, targetDateHistoryEpochRange(isoDate, days), 500);
}

async function executeApiRequest(request, fetchImpl) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch implementation unavailable");
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(15000) : undefined,
  });

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Attendance API returned non-JSON response (${response.status})`);
  }

  return {
    status: response.status,
    endpoint: request.url,
    request: {
      method: request.method,
      url: request.url,
      post_data: JSON.stringify(request.body),
      headers: request.headers,
    },
    body,
  };
}

export async function fetchDirectAttendancePayload(attendanceUrl, isoDate, { fetchImpl = globalThis.fetch } = {}) {
  return executeApiRequest(buildDirectApiRequest(attendanceUrl, isoDate), fetchImpl);
}

export async function fetchDirectAttendanceHistoryPayload(
  attendanceUrl,
  isoDate,
  { fetchImpl = globalThis.fetch, days = 45 } = {},
) {
  return executeApiRequest(buildDirectApiHistoryRequest(attendanceUrl, isoDate, days), fetchImpl);
}
