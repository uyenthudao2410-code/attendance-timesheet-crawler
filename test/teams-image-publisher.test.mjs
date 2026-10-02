import test from "node:test";
import assert from "node:assert/strict";
import {buildTeamsHostedImagePayload,formatVietnameseDate} from "../src/teams-image-publisher.mjs";

const report={kind:"attendance_business_report",slot:"morning_1230",date:"2026-10-02"};

test("formats Vietnamese date deterministically",()=>{
  assert.equal(formatVietnameseDate("2026-10-02"),"Thứ Sáu, 02/10/2026");
});

test("TEST caption is concise and native hosted-content",()=>{
  const payload=buildTeamsHostedImagePayload({report,imageBase64:"YWJj",mode:"TEST"});
  assert.match(payload.body.content,/^<b>\[TEST\] BÁO CÁO CHẤM CÔNG — CA SÁNG<\/b>/);
  assert.match(payload.body.content,/Thứ Sáu, 02\/10\/2026/);
  assert.match(payload.body.content,/\.\.\/hostedContents\/1\/\$value/);
  assert.doesNotMatch(payload.body.content,/Lưu ý:/);
  assert.doesNotMatch(payload.body.content,/Bản kiểm thử nội bộ/);
  assert.equal(payload.hostedContents[0]["@microsoft.graph.temporaryId"],"1");
  assert.equal(payload.hostedContents[0].contentType,"image/png");
});

test("PRODUCTION caption has no test marker",()=>{
  const payload=buildTeamsHostedImagePayload({
    report:{...report,slot:"daily_2105",date:"2026-10-01"},
    imageBase64:"YWJj",
    mode:"PRODUCTION",
  });
  assert.match(payload.body.content,/^<b>BÁO CÁO CHẤM CÔNG — CẢ NGÀY<\/b>/);
  assert.match(payload.body.content,/Thứ Năm, 01\/10\/2026/);
  assert.doesNotMatch(payload.body.content,/\[TEST\]/);
  assert.doesNotMatch(payload.body.content,/Lưu ý:/);
});
