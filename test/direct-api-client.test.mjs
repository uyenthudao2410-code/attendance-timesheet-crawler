import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDirectApiHistoryRequest,
  buildDirectApiRequest,
  extractDeviceId,
  fetchDirectAttendanceHistoryPayload,
  fetchDirectAttendancePayload,
  targetDateEpochRange,
  targetDateHistoryEpochRange,
} from "../src/direct-api-client.mjs";

test("extractDeviceId preserves device identity from H5 URL", () => {
  assert.equal(
    extractDeviceId("https://h5.timemark.com/attendance-management?deviceId=device-123&attendanceType=inWork"),
    "device-123",
  );
});

test("target date window uses Vietnam UTC+7 calendar day", () => {
  const range = targetDateEpochRange("2026-08-21");
  assert.equal(range.endTimestamp - range.startTimestamp, 86399);
  assert.equal(new Date(range.startTimestamp * 1000).toISOString(), "2026-08-20T17:00:00.000Z");
});

test("45-day history window ends on target Vietnam day", () => {
  const range = targetDateHistoryEpochRange("2026-08-21", 45);
  const target = targetDateEpochRange("2026-08-21");
  assert.equal(range.endTimestamp, target.endTimestamp);
  assert.equal(target.startTimestamp - range.startTimestamp, 44 * 86400);
});

test("direct API request is a bounded read-only query", () => {
  const request = buildDirectApiRequest(
    "https://h5.dayscamera.com/attendance-management?deviceId=device-456&attendanceType=myTimesheet",
    "2026-08-21",
  );
  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://app.dayscamera.com/next/attendance/record/query/plain");
  assert.equal(request.body.device_id, "device-456");
  assert.equal(request.body.page, 1);
  assert.equal(request.body.pageSize, 100);
  assert.equal(request.headers.referer, "https://h5.dayscamera.com/");
});

test("history API request stays read-only and bounded", () => {
  const request = buildDirectApiHistoryRequest(
    "https://h5.timemark.com/attendance-management?deviceId=device-history",
    "2026-08-21",
  );
  assert.equal(request.method, "POST");
  assert.equal(request.body.device_id, "device-history");
  assert.equal(request.body.page, 1);
  assert.equal(request.body.pageSize, 500);
  assert.equal(request.body.endTimestamp - request.body.startTimestamp + 1, 45 * 86400);
});

test("direct API client returns the normalized envelope without auth headers", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      status: 200,
      async json() {
        return { code: 200, data: { status: 0, records: [], totalNum: 0 } };
      },
    };
  };

  const payload = await fetchDirectAttendancePayload(
    "https://h5.timemark.com/attendance-management?deviceId=device-789",
    "2026-08-21",
    { fetchImpl: fakeFetch },
  );

  assert.equal(payload.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(calls[0].options.headers.cookie, undefined);
  assert.equal(JSON.parse(payload.request.post_data).device_id, "device-789");
});

test("history API client uses the same unauthenticated read-only endpoint", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      status: 200,
      async json() {
        return { code: 200, data: { status: 0, records: [], totalNum: 0 } };
      },
    };
  };

  await fetchDirectAttendanceHistoryPayload(
    "https://h5.dayscamera.com/attendance-management?deviceId=device-history",
    "2026-08-21",
    { fetchImpl: fakeFetch },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://app.dayscamera.com/next/attendance/record/query/plain");
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(calls[0].options.headers.cookie, undefined);
  assert.equal(JSON.parse(calls[0].options.body).pageSize, 500);
});

test("transient network failure is retried once for read-only attendance", async () => {
  let calls=0;
  const fakeFetch=async()=>{
    calls+=1;
    if(calls===1)throw new Error("network temporarily unavailable");
    return {status:200,async json(){return {code:200,data:{status:0,records:[],totalNum:0}};}};
  };
  const result=await fetchDirectAttendancePayload(
    "https://h5.timemark.com/attendance-management?deviceId=retry-test",
    "2026-10-08",{fetchImpl:fakeFetch}
  );
  assert.equal(result.status,200);
  assert.equal(calls,2);
});

test("transient HTTP 503 is retried but HTTP 404 is not", async () => {
  let calls=0;
  const transient=async()=>{
    calls+=1;
    if(calls===1)return {status:503,async json(){return {code:503};}};
    return {status:200,async json(){return {code:200,data:{status:0,records:[],totalNum:0}};}};
  };
  const url="https://h5.timemark.com/attendance-management?deviceId=retry-http";
  const recovered=await fetchDirectAttendancePayload(url,"2026-10-08",{fetchImpl:transient});
  assert.equal(recovered.status,200);
  assert.equal(calls,2);
  let nonretryCalls=0;
  const bad=await fetchDirectAttendancePayload(url,"2026-10-08",{
    fetchImpl:async()=>{nonretryCalls+=1;return {status:404,async json(){return {code:404};}};}
  });
  assert.equal(bad.status,404);
  assert.equal(nonretryCalls,1);
});

test("persistent transient API failures are bounded to two attempts", async () => {
  let calls=0;
  const url="https://h5.timemark.com/attendance-management?deviceId=retry-limit";
  await assert.rejects(
    ()=>fetchDirectAttendancePayload(url,"2026-10-08",{
      fetchImpl:async()=>{calls+=1;return {status:429,async json(){return {code:429};}};}
    }),
    /ATTENDANCE_API_TRANSIENT_HTTP_429/
  );
  assert.equal(calls,2);
});
