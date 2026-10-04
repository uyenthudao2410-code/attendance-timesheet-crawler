import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTENDANCE_AI_HANDOFF_CHAT_ID,
  ATTENDANCE_AI_HANDOFF_MARKER,
  ATTENDANCE_DIRECT_IMAGE_SCHEMA_VERSION,
  ATTENDANCE_TEST_CHAT_ID,
  assertAttendanceRouteIsolation,
  validateChatGptDirectImageTrigger,
} from "../src/attendance-routing.mjs";

test("attendance handoff and TEST publication chats are permanently isolated",()=>{
  assert.notEqual(ATTENDANCE_AI_HANDOFF_CHAT_ID,ATTENDANCE_TEST_CHAT_ID);
  assert.equal(assertAttendanceRouteIsolation(),true);
  assert.equal(ATTENDANCE_AI_HANDOFF_MARKER,"ATTENDANCE_AI_HANDOFF_V3");
  assert.equal(ATTENDANCE_DIRECT_IMAGE_SCHEMA_VERSION,3);
});

function validTrigger(slot="morning_1230"){
  const daily=slot==="daily_2105";
  return {
    schema_version:3,
    enabled:true,
    mode:"TEST",
    target_type:"chat",
    chat_id:ATTENDANCE_TEST_CHAT_ID,
    image_origin:"chatgpt_image",
    direct_output:true,
    edited_after_generation:false,
    fallback_renderer_used:false,
    qa_status:"passed",
    source_handoff_chat_id:ATTENDANCE_AI_HANDOFF_CHAT_ID,
    source_handoff_marker:ATTENDANCE_AI_HANDOFF_MARKER,
    source_prompt_sha256:"a".repeat(64),
    source_handoff_message_id:"1234567890",
    slot,
    target_date:daily?"2026-10-03":"2026-10-04",
    drive_id:"drive",
    item_id:"item",
    file_name:daily
      ?"attendance-daily-2026-10-03-chatgpt-direct.png"
      :"attendance-morning-2026-10-04-chatgpt-direct.png",
    summary:{
      total_employees:8,
      ...(daily?{with_record_count:6}:{}),
      recorded_count:daily?6:3,
      attention_count:daily?2:5,
      attendance_rate:daily?75:38,
      total_hours_text:daily?"47h54":"10h44",
    },
  };
}

test("valid untouched direct ChatGPT Image trigger passes",()=>{
  const v=validateChatGptDirectImageTrigger(validTrigger());
  assert.equal(v.enabled,true);
  assert.equal(v.slot,"morning_1230");
  const d=validateChatGptDirectImageTrigger(validTrigger("daily_2105"));
  assert.equal(d.slot,"daily_2105");
});

test("handoff source cannot be TEST chat",()=>{
  const x=validTrigger();
  x.source_handoff_chat_id=ATTENDANCE_TEST_CHAT_ID;
  assert.throws(()=>validateChatGptDirectImageTrigger(x),/isolated technical handoff chat/);
});

test("renderer, edited, composited, or arbitrary image output is rejected",()=>{
  const a=validTrigger();
  a.image_origin="renderer";
  assert.throws(()=>validateChatGptDirectImageTrigger(a),/ChatGPT Image output only/);

  const b=validTrigger();
  b.direct_output=false;
  assert.throws(()=>validateChatGptDirectImageTrigger(b),/direct ChatGPT Image output/);

  const c=validTrigger();
  c.edited_after_generation=true;
  assert.throws(()=>validateChatGptDirectImageTrigger(c),/forbidden/);

  const d=validTrigger();
  d.fallback_renderer_used=true;
  assert.throws(()=>validateChatGptDirectImageTrigger(d),/Fallback renderer is forbidden/);

  const e=validTrigger();
  e.file_name="attendance-morning-2026-10-04-professional.png";
  assert.throws(()=>validateChatGptDirectImageTrigger(e),/untouched direct ChatGPT output/);
});

test("failed QA or old schema is rejected",()=>{
  const x=validTrigger();
  x.qa_status="failed";
  assert.throws(()=>validateChatGptDirectImageTrigger(x),/QA has not passed/);

  const y=validTrigger();
  y.schema_version=2;
  assert.throws(()=>validateChatGptDirectImageTrigger(y),/trigger schema/);
});
