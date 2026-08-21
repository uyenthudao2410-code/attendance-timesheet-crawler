const API_URL = "https://app.dayscamera.com/next/attendance/record/query/plain";
const VIETNAM_OFFSET = "+07:00";

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
    endTimestamp: startTimestamp + 24 * 60 * 60 - 1,
  };
}

export function buildDirectApiRequest(attendanceUrl, isoDate) {
  const sourceUrl = new URL(attendanceUrl);
  const deviceId = extractDeviceId(attendanceUrl);
  const { startTimestamp, endTimestamp } = targetDateEpochRange(isoDate);
  const body = {
    device_id: deviceId,
    startTimestamp,
    endTimestamp,
    page: 1,
    pageSize: 100,
  };
  return {
    url: API_URL,
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      referer: `${sourceUrl.origin}/`,
    },
    body,
  };
}

export async function fetchDirectAttendancePayload(attendanceUrl, isoDate, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch implementation unavailable");
  const request = buildDirectApiRequest(attendanceUrl, isoDate);
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
