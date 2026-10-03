import test from "node:test";
import assert from "node:assert/strict";
import { validateFreshPublication } from "../src/snapshot-freshness.mjs";

const now = Date.parse("2026-10-03T06:30:00Z");
const trigger = {
  schema_version: 1,
  request_id: "fresh-morning-20261003",
  requested_at: "2026-10-03T06:28:00Z",
  slot: "morning_1230",
  target_date: "2026-10-03",
};
const report = {
  kind: "attendance_business_report",
  request_id: "fresh-morning-20261003",
  requested_at: "2026-10-03T06:28:00Z",
  slot: "morning_1230",
  date: "2026-10-03",
  source_generated_at: "2026-10-03T06:28:40Z",
  generated_at: "2026-10-03T06:29:00Z",
};

test("accepts same-request fresh source, report and image", () => {
  const result = validateFreshPublication({
    trigger,
    report,
    imageMtimeMs: Date.parse("2026-10-03T06:29:30Z"),
    nowMs: now,
  });
  assert.equal(result.request_id, trigger.request_id);
});

test("rejects source snapshot from before current request", () => {
  assert.throws(() => validateFreshPublication({
    trigger,
    report: { ...report, source_generated_at: "2026-10-03T06:20:00Z" },
    nowMs: now,
  }), /source predates/);
});

test("rejects stale source even when request ids match", () => {
  const oldTrigger = { ...trigger, requested_at: "2026-10-03T06:00:00Z" };
  const oldReport = {
    ...report,
    requested_at: oldTrigger.requested_at,
    source_generated_at: "2026-10-03T06:01:00Z",
    generated_at: "2026-10-03T06:02:00Z",
  };
  assert.throws(() => validateFreshPublication({
    trigger: oldTrigger,
    report: oldReport,
    nowMs: now,
  }), /source snapshot is stale/);
});

test("rejects image generated before the current report", () => {
  assert.throws(() => validateFreshPublication({
    trigger,
    report,
    imageMtimeMs: Date.parse("2026-10-03T06:28:00Z"),
    nowMs: now,
  }), /image predates/);
});

test("rejects another request id", () => {
  assert.throws(() => validateFreshPublication({
    trigger,
    report: { ...report, request_id: "old-request" },
    nowMs: now,
  }), /request_id mismatch/);
});
