import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/attendance-crawl.yml','utf8');
const publisher=fs.readFileSync('scripts/post-native-attendance-production.mjs','utf8');

test('daily and morning preview requests are routed through separate native Teams ledgers',()=>{
  assert.match(workflow,/design-preview-morning_1230-\*\|design-preview-daily_2105-\*/);
  assert.match(workflow,/ATTENDANCE_NATIVE_PREVIEW=\$preview/);
  assert.match(workflow,/case "\$\{ATTENDANCE_RUN_SLOT\}" in[\s\S]*morning_1230\|daily_2105/);
  assert.match(publisher,/design-preview-\(\?:morning_1230\|daily_2105\)/);
  assert.match(publisher,/requestId\.startsWith\('design-preview-'\+slot\+'-'\+date\+'-'\)/);
  assert.ok(publisher.includes("'.github/attendance-native-previews/'+requestId+'.json'"));
  assert.ok(publisher.includes("'.github/attendance-publications/'+slot+'-'+date+'.json'"));
  assert.match(publisher,/DELIVERY_UNCERTAIN_RECONCILE_BEFORE_RESEND/);
  assert.match(publisher,/previous\?\.value\?\.status==='sent'/);
});

test('production recurring schedules and graph target do not change',()=>{
  assert.match(workflow,/cron: "40 23 \* \* \*"/);
  assert.match(workflow,/cron: "40 6 \* \* \*"/);
  assert.match(workflow,/daily_2105\) publish_hm="06:50"/);
  assert.match(workflow,/morning_1230\) publish_hm="13:50"/);
  assert.ok(workflow.includes('if [ "${{ github.event_name }}" = "schedule" ]; then'));
  assert.match(publisher,/TEST_CHAT/);
  assert.match(publisher,/status:'sending'/);
  assert.match(publisher,/ATTENDANCE_NATIVE_TEAMS_MESSAGE_ID/);
});


test('both production slots remain scheduled with native Adaptive Card publishing',()=>{
  assert.match(workflow,/cron: "40 23 \* \* \*"/);
  assert.match(workflow,/cron: "40 6 \* \* \*"/);
  assert.match(workflow,/daily_2105\) publish_hm="06:50"/);
  assert.match(workflow,/morning_1230\) publish_hm="13:50"/);
  assert.match(workflow,/node scripts\/post-native-attendance-production\.mjs/);
  assert.match(publisher,/ATTENDANCE_NATIVE_SCOPE_LAYOUT_GATE_FAILED/);
});
