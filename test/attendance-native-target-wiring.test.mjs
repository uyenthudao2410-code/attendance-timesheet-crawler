import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/attendance-crawl.yml','utf8');
const audit=fs.readFileSync('.github/workflows/attendance-teams-target-audit.yml','utf8');
const publisher=fs.readFileSync('scripts/post-native-attendance-production.mjs','utf8');

test('production V24 destination uses only current GitHub repository variables',()=>{
  assert.match(workflow,/ATTENDANCE_TEAMS_TARGET_TYPE: \$\{\{ vars[.]TEAMS_TARGET_TYPE \}\}/);
  assert.match(workflow,/ATTENDANCE_TEAMS_CHAT_ID: \$\{\{ vars[.]TEAMS_CHAT_ID \}\}/);
  assert.doesNotMatch(workflow,/ATTENDANCE_TEAMS_CHANNEL_ID:/);
  assert.doesNotMatch(workflow,/secrets[.]TEAMS_CHAT_ID/);
  assert.match(publisher,/resolveAttendanceTeamsTarget\(process[.]env,false,TEST_CHAT\)/);
  assert.match(publisher,/OFFICIAL_CHAT_ID/);
  assert.match(publisher,/ATTENDANCE_OFFICIAL_GROUP_CHAT_ONLY/);
  assert.doesNotMatch(publisher,/GRAPH\+'\/chats\/'\+encodeURIComponent\(TEST_CHAT\)/);
});

test('no-post audit validates official group chat and Graph Chat.Read',()=>{
  assert.match(audit,/vars[.]TEAMS_TARGET_TYPE/);
  assert.match(audit,/vars[.]TEAMS_CHAT_ID/);
  assert.match(audit,/PRODUCTION_OFFICIAL_CHAT_ID_MISMATCH/);
  assert.match(audit,/ATTENDANCE_CHAT_READ_PREFLIGHT=PASSED/);
  assert.match(audit,/ATTENDANCE_TEAMS_SEND_ATTEMPTED=false/);
});

test('route check only uses separate receipt and a configured official group chat',()=>{
  assert.match(workflow,/route-check-morning_1230-\*\|route-check-daily_2105-\*/);
  assert.match(workflow,/ATTENDANCE_NATIVE_ROUTE_CHECK=\$route_check/);
  assert.match(publisher,/ATTENDANCE_DESIGN_PREVIEW_DISABLED_ROUTE_CHECK_ONLY/);
  assert.match(publisher,/attendance_native_adaptive_card_route_check/);
  assert.match(publisher,/ATTENDANCE_ROUTE_CHECK_REQUIRES_CONFIGURED_GROUP_CHAT/);
  assert.ok(publisher.includes("'.github/attendance-native-previews/'+requestId+'.json'"));
  assert.ok(publisher.includes('ATTENDANCE_CARD_ALREADY_EXISTS_IN_OFFICIAL_CHAT_NO_RESEND'));
});
