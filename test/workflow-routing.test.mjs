import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const TEST_CHAT_ID="19:0e02d613cded448892f27d74cff19d63@thread.v2";

test("producer workflow never embeds the TEST publication chat",()=>{
  const workflow=fs.readFileSync(".github/workflows/attendance-crawl.yml","utf8");
  assert.equal(workflow.includes(TEST_CHAT_ID),false);
  assert.match(workflow,/post-ai-handoff-to-self-chat\.mjs/);
  assert.match(workflow,/isolated technical handoff chat/);
});

test("handoff sender cannot be overridden to a different chat by environment",()=>{
  const script=fs.readFileSync("scripts/post-ai-handoff-to-self-chat.mjs","utf8");
  assert.doesNotMatch(script,/process\.env\.ATTENDANCE_AI_HANDOFF_CHAT_ID/);
  assert.match(script,/ATTENDANCE_AI_HANDOFF_CHAT_ID/);
  assert.match(script,/ATTENDANCE_AI_HANDOFF_MARKER/);
});

test("publisher accepts only final ChatGPT-image trigger schema",()=>{
  const script=fs.readFileSync("scripts/post-external-image-to-teams.mjs","utf8");
  assert.match(script,/validateChatGptImageTrigger/);
  assert.match(script,/ATTENDANCE_EXPECTED_GRAPH_USER/);
  assert.doesNotMatch(script,/professional\.png/);
});
