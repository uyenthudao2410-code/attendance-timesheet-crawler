import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/attendance-crawl.yml','utf8');
const publisher=fs.readFileSync('scripts/post-native-attendance-production.mjs','utf8');
test('production publisher reads GitHub variable/secret destination rather than hardcoding TEST',()=>{
  assert.match(workflow,/ATTENDANCE_TEAMS_TARGET_TYPE:/);
  assert.match(workflow,/vars\.TEAMS_CHANNEL_ID/);
  assert.match(workflow,/secrets\.TEAMS_CHAT_ID/);
  assert.match(workflow,/vars\.TEAMS_TEAM_ID/);
  assert.match(publisher,/resolveAttendanceTeamsTarget\(process\.env,preview,TEST_CHAT\)/);
  assert.match(publisher,/GRAPH\+target\.endpoint/);
  assert.doesNotMatch(publisher,/GRAPH\+'\/chats\/'\+encodeURIComponent\(TEST_CHAT\)/);
  assert.match(publisher,/ATTENDANCE_ALREADY_SENT_DIFFERENT_TEAMS_DESTINATION_NO_AUTOREPOST/);
});
