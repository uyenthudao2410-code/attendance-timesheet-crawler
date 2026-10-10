import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const TEST_CHAT_ID='19:0e02d613cded448892f27d74cff19d63@thread.v2';
const workflow=fs.readFileSync('.github/workflows/attendance-crawl.yml','utf8');

test('V24 producer never embeds TEST and never executes legacy AI image handoff',()=>{
  assert.equal(workflow.includes(TEST_CHAT_ID),false);
  assert.doesNotMatch(workflow,/post-ai-handoff-to-self-chat[.]mjs/);
  assert.doesNotMatch(workflow,/build-ai-visual-request[.]mjs/);
  assert.match(workflow,/node scripts[/]post-native-attendance-production[.]mjs/);
  assert.match(workflow,/ATTENDANCE_NATIVE_ROUTE_CHECK/);
  assert.doesNotMatch(workflow,/design-preview-morning/);
});

test('legacy AI sender remains isolated but is not in the production pipeline',()=>{
  const script=fs.readFileSync('scripts/post-ai-handoff-to-self-chat.mjs','utf8');
  assert.doesNotMatch(script,/process[.]env[.]ATTENDANCE_AI_HANDOFF_CHAT_ID/);
  assert.match(script,/ATTENDANCE_AI_HANDOFF_CHAT_ID/);
  assert.match(script,/ATTENDANCE_AI_HANDOFF_MARKER/);
});

test('legacy direct image publisher is still restricted to isolated TEST transport',()=>{
  const script=fs.readFileSync('scripts/post-external-image-to-teams.mjs','utf8');
  assert.match(script,/validateChatGptDirectImageTrigger/);
  assert.match(script,/ATTENDANCE_EXPECTED_GRAPH_USER/);
  assert.match(script,/direct_output/);
  assert.match(script,/edited_after_generation/);
  assert.match(script,/fallback_renderer_used/);
});
