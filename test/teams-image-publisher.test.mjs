import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTeamsHostedImagePayload,
  formatVietnameseDate,
} from "../src/teams-image-publisher.mjs";

const report = {
  kind: "attendance_business_report",
  slot: "morning_1230",
  date: "2026-10-02",
};

test("formats Vietnamese attendance date deterministically", () => {
  assert.equal(formatVietnameseDate("2026-10-02"), "Thứ Sáu, 02/10/2026");
});

test("builds a native Teams hosted-content image payload", () => {
  const payload = buildTeamsHostedImagePayload({
    report,
    imageBase64: "YWJj",
    testLabel: "Bản kiểm thử nội bộ • TEST hệ thống",
  });

  assert.equal(payload.body.contentType, "html");
  assert.match(payload.body.content, /BÁO CÁO CHẤM CÔNG — CA SÁNG/);
  assert.match(payload.body.content, /Thứ Sáu, 02\/10\/2026/);
  assert.match(payload.body.content, /\.\.\/hostedContents\/1\/\$value/);
  assert.match(payload.body.content, /P\.HC-NS/);
  assert.doesNotMatch(payload.body.content, /TEST FORM/);
  assert.equal(payload.hostedContents.length, 1);
  assert.equal(payload.hostedContents[0]["@microsoft.graph.temporaryId"], "1");
  assert.equal(payload.hostedContents[0].contentType, "image/png");
  assert.equal(payload.hostedContents[0].contentBytes, "YWJj");
});

test("daily caption uses full-day production wording", () => {
  const payload = buildTeamsHostedImagePayload({
    report: { ...report, slot: "daily_2105", date: "2026-10-01" },
    imageBase64: "YWJj",
  });
  assert.match(payload.body.content, /BÁO CÁO CHẤM CÔNG — CẢ NGÀY/);
  assert.match(payload.body.content, /Thứ Năm, 01\/10\/2026/);
});
