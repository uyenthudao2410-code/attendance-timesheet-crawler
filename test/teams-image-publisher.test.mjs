import test from "node:test";
import assert from "node:assert/strict";
import {buildTeamsHostedImagePayload,formatVietnameseDate} from "../src/teams-image-publisher.mjs";

const morningReport={
  kind:"attendance_business_report",
  slot:"morning_1230",
  date:"2026-10-04",
  summary:{
    total_employees:8,
    recorded_count:3,
    attention_count:5,
    attendance_rate:38,
    total_hours_text:"10h44",
  },
};

test("Vietnamese date is stable",()=>{
  assert.equal(formatVietnameseDate("2026-10-04"),"Chủ Nhật, 04/10/2026");
});

test("TEST payload is concise and contains exactly one final image",()=>{
  const p=buildTeamsHostedImagePayload({report:morningReport,imageBase64:"YQ==",mode:"TEST"});
  assert.match(p.body.content,/\[TEST\] BÁO CÁO CHẤM CÔNG — CA SÁNG/);
  assert.match(p.body.content,/3\/8 đã ghi nhận/);
  assert.match(p.body.content,/5 cần kiểm tra/);
  assert.match(p.body.content,/10h44/);
  assert.match(p.body.content,/hostedContents\/1\/\$value/);
  assert.doesNotMatch(p.body.content,/PROMPT_BEGIN|ATTENDANCE_AI_HANDOFF/);
  assert.equal(p.hostedContents.length,1);
});

test("production caption has no test marker",()=>{
  const p=buildTeamsHostedImagePayload({
    report:{
      kind:"attendance_business_report",
      slot:"daily_2105",
      date:"2026-10-03",
      summary:{
        total_employees:8,
        with_record_count:6,
        recorded_count:6,
        attention_count:2,
        attendance_rate:75,
        total_hours_text:"47h54",
      },
    },
    imageBase64:"YQ==",
    mode:"PRODUCTION",
  });
  assert.match(p.body.content,/BÁO CÁO CHẤM CÔNG — CẢ NGÀY/);
  assert.match(p.body.content,/6\/8 có dữ liệu/);
  assert.doesNotMatch(p.body.content,/\[TEST\]/);
});

test("empty final image is rejected",()=>{
  assert.throws(
    ()=>buildTeamsHostedImagePayload({report:morningReport,imageBase64:"",mode:"TEST"}),
    /final ChatGPT-generated image/,
  );
});
