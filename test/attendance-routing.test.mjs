import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTENDANCE_AI_HANDOFF_CHAT_ID,
  ATTENDANCE_AI_HANDOFF_MARKER,
  ATTENDANCE_TEST_CHAT_ID,
  assertAttendanceRouteIsolation,
  validateChatGptImageTrigger,
} from "../src/attendance-routing.mjs";

test("attendance handoff and TEST publication chats are permanently isolated",()=>{
  assert.notEqual(ATTENDANCE_AI_HANDOFF_CHAT_ID,ATTENDANCE_TEST_CHAT_ID);
  assert.equal(assertAttendanceRouteIsolation(),true);
  assert.equal(ATTENDANCE_AI_HANDOFF_MARKER,"ATTENDANCE_AI_HANDOFF_V3");
});

function validTrigger(){
  return {
    schema_version:2,
    enabled:true,
    mode:"TEST",
    target_type:"chat",
    chat_id:ATTENDANCE_TEST_CHAT_ID,
    image_origin:"chatgpt_image",
    qa_status:"passed",
    source_handoff_chat_id:ATTENDANCE_AI_HANDOFF_CHAT_ID,
    source_handoff_marker:ATTENDANCE_AI_HANDOFF_MARKER,
    source_prompt_sha256:"a".repeat(64),
    source_handoff_message_id:"1234567890",
    slot:"morning_1230",
    target_date:"2026-10-04",
    drive_id:"drive",
    item_id:"item",
    file_name:"attendance-morning-2026-10-04-chatgpt.png",
    summary:{
      total_employees:8,
      recorded_count:3,
      attention_count:5,
      attendance_rate:38,
      total_hours_text:"10h44",
    },
  };
}

test("valid ChatGPT Image trigger passes",()=>{
  const v=validateChatGptImageTrigger(validTrigger());
  assert.equal(v.enabled,true);
  assert.equal(v.slot,"morning_1230");
});

test("handoff source cannot be TEST chat",()=>{
  const x=validTrigger();
  x.source_handoff_chat_id=ATTENDANCE_TEST_CHAT_ID;
  assert.throws(()=>validateChatGptImageTrigger(x),/isolated technical handoff chat/);
});

test("renderer or arbitrary image filename is rejected",()=>{
  const x=validTrigger();
  x.file_name="attendance-morning-2026-10-04-professional.png";
  assert.throws(()=>validateChatGptImageTrigger(x),/exact ChatGPT final filename/);
});

test("non-ChatGPT origin and failed QA are rejected",()=>{
  const x=validTrigger();
  x.image_origin="renderer";
  assert.throws(()=>validateChatGptImageTrigger(x),/ChatGPT Image output only/);
  const y=validTrigger();
  y.qa_status="failed";
  assert.throws(()=>validateChatGptImageTrigger(y),/QA has not passed/);
});
