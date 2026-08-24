import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseBrowserAttendance,
  shouldBrowserVerifyAttendance,
} from "../src/source-selection.mjs";

test("date_not_found direct result requires browser verification", () => {
  assert.equal(shouldBrowserVerifyAttendance({ status: "date_not_found" }), true);
  assert.equal(shouldBrowserVerifyAttendance({ status: "incomplete" }), false);
  assert.equal(shouldBrowserVerifyAttendance({ status: "complete" }), false);
  assert.equal(shouldBrowserVerifyAttendance(null), true);
});

test("rendered H5 data wins when browser API says date_not_found", () => {
  const api = { status: "date_not_found", data_source: "attendance_api_browser" };
  const dom = {
    status: "complete",
    morning: { in: "07:22", out: "08:33", minutes: 71 },
    afternoon: null,
    total_minutes: 71,
    data_source: "rendered_dom",
  };

  const selected = chooseBrowserAttendance(api, dom);
  assert.equal(selected.recovered_from_dom, true);
  assert.equal(selected.source_disagreement, "api_date_not_found_but_dom_found");
  assert.equal(selected.attendance.status, "complete");
  assert.equal(selected.attendance.morning.in, "07:22");
  assert.equal(selected.attendance.morning.out, "08:33");
  assert.equal(selected.attendance.data_source, "rendered_dom_verified_after_api_miss");
});

test("structured browser API remains preferred when it has target-date data", () => {
  const api = {
    status: "complete",
    morning: { in: "07:29", out: "11:45", minutes: 256 },
    total_minutes: 256,
    data_source: "attendance_api_browser",
  };
  const dom = { status: "date_not_found", data_source: "rendered_dom" };

  const selected = chooseBrowserAttendance(api, dom);
  assert.equal(selected.recovered_from_dom, false);
  assert.equal(selected.source_disagreement, null);
  assert.equal(selected.attendance, api);
});
