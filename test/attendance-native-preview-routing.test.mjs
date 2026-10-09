import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/attendance-crawl.yml','utf8');
const publisher=fs.readFileSync('scripts/post-native-attendance-production.mjs','utf8');
const watchdog=fs.readFileSync('.github/workflows/attendance-producer-watchdog.yml','utf8');

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

test('production crawl 06:00/13:00 leads unchanged 06:50/13:50 Teams publication',()=>{
  assert.match(workflow,/cron: "0 6 \* \* \*"/);
  assert.match(workflow,/cron: "0 13 \* \* \*"/);
  assert.equal((workflow.match(/timezone: "Asia\/Ho_Chi_Minh"/g)||[]).length,2);
  assert.match(workflow,/timeout-minutes: 90/);
  assert.match(workflow,/wait_seconds" -gt 3600/);
  assert.match(workflow,/daily_2105\) publish_hm="06:50"/);
  assert.match(workflow,/morning_1230\) publish_hm="13:50"/);
  assert.ok(workflow.includes('if [ "${{ github.event_name }}" = "schedule" ]; then'));
  assert.match(publisher,/TEST_CHAT/);
  assert.match(publisher,/status:'sending'/);
  assert.match(publisher,/ATTENDANCE_NATIVE_TEAMS_MESSAGE_ID/);
});


test('both production slots remain scheduled with native Adaptive Card publishing',()=>{
  assert.match(workflow,/cron: "0 6 \* \* \*"/);
  assert.match(workflow,/cron: "0 13 \* \* \*"/);
  assert.match(workflow,/daily_2105\) publish_hm="06:50"/);
  assert.match(workflow,/morning_1230\) publish_hm="13:50"/);
  assert.match(workflow,/node scripts\/post-native-attendance-production\.mjs/);
  assert.match(publisher,/ATTENDANCE_NATIVE_SCOPE_LAYOUT_GATE_FAILED/);
});

test('native V24 watchdog runs early and fails closed on unsettled Teams receipts',()=>{
  const crons=[
    '12 6 * * *','30 6 * * *','42 6 * * *',
    '12 13 * * *','30 13 * * *','42 13 * * *'
  ];
  for(const cron of crons)assert.ok(watchdog.includes('cron: "'+cron+'"'));
  assert.equal(watchdog.split('timezone: "Asia/Ho_Chi_Minh"').length-1,6);
  assert.ok(watchdog.includes("state = /^\\d+$/.test(String(receipt?.message_id || ''))"));
  assert.ok(watchdog.includes('WATCHDOG_STATE=publication_receipt_sent'));
  assert.ok(watchdog.includes('WATCHDOG_STATE=delivery_uncertain_fail_closed'));
  assert.ok(watchdog.includes('WATCHDOG_STATE=producer_pending'));
  assert.ok(watchdog.includes('WATCHDOG_STATE=self_heal_already_requested'));
  assert.ok(watchdog.includes('/^(?:watchdog-|self-heal-)/.test(id)'));
  assert.ok(watchdog.indexOf('WATCHDOG_STATE=publication_receipt_sent')<
    watchdog.indexOf('request_id="watchdog-'));
  assert.doesNotMatch(watchdog,/ATTENDANCE_AI_VISUAL_V10/);
});
