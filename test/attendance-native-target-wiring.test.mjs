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
  assert.match(publisher,/resolveAttendanceTeamsTarget\(process\.env,preview&&!routeCheck,TEST_CHAT\)/);
  assert.match(publisher,/GRAPH\+target\.endpoint/);
  assert.doesNotMatch(publisher,/GRAPH\+'\/chats\/'\+encodeURIComponent\(TEST_CHAT\)/);
  assert.match(publisher,/ATTENDANCE_ALREADY_SENT_DIFFERENT_TEAMS_DESTINATION_NO_AUTOREPOST/);
});

test('the repository TEAMS_CHAT_ID and TEAMS_TARGET_TYPE variables win over any shadow aliases',()=>{
  const type='vars.TEAMS_TARGET_TYPE || vars.ATTENDANCE_TEAMS_TARGET_TYPE';
  const chat='vars.TEAMS_CHAT_ID || vars.ATTENDANCE_TEAMS_CHAT_ID';
  const audit=fs.readFileSync('.github/workflows/attendance-teams-target-audit.yml','utf8');
  assert.ok(workflow.includes(type));
  assert.ok(workflow.includes(chat));
  assert.ok(audit.includes(type));
  assert.ok(audit.includes(chat));
});

test('explicit configured-chat route checks cannot use default TEST or production sent receipt',()=>{
  assert.match(workflow,/route-check-morning_1230-\*\|route-check-daily_2105-\*/);
  assert.match(workflow,/ATTENDANCE_NATIVE_ROUTE_CHECK=\$route_check/);
  assert.ok(publisher.includes("preview&&!routeCheck,TEST_CHAT"));
  assert.ok(publisher.includes("routeCheck?'attendance_native_adaptive_card_route_check'"));
  assert.ok(publisher.includes("'.github/attendance-native-previews/'+requestId+'.json'"));
  assert.ok(publisher.includes("ATTENDANCE_ROUTE_CHECK_REQUIRES_CONFIGURED_GROUP_CHAT"));
});
