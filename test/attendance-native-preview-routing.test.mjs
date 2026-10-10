import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/attendance-crawl.yml','utf8');
const publisher=fs.readFileSync('scripts/post-native-attendance-production.mjs','utf8');
const watchdog=fs.readFileSync('.github/workflows/attendance-producer-watchdog.yml','utf8');

test('design-preview and legacy AI are disabled in native V24 production',()=>{
  assert.doesNotMatch(workflow,/design-preview-morning_1230/);
  assert.doesNotMatch(workflow,/post-ai-handoff-to-self-chat[.]mjs/);
  assert.match(publisher,/ATTENDANCE_DESIGN_PREVIEW_DISABLED_ROUTE_CHECK_ONLY/);
  assert.match(workflow,/ATTENDANCE_NATIVE_PREVIEW=\$preview/);
  assert.match(publisher,/ATTENDANCE_ALREADY_SENT_DIFFERENT_TEAMS_DESTINATION_NO_AUTOREPOST/);
  assert.match(publisher,/DELIVERY_UNCERTAIN_RECONCILE_BEFORE_RESEND/);
});

test('explicit route-check is isolated from immutable production receipts',()=>{
  assert.match(workflow,/route-check-morning_1230-\*\|route-check-daily_2105-\*/);
  assert.ok(publisher.includes("'.github/attendance-native-previews/'+requestId+'.json'"));
  assert.ok(publisher.includes("'.github/attendance-publications/'+slot+'-'+date+'.json'"));
  assert.ok(publisher.includes('DELIVERY_UNCERTAIN_NO_AUTOMATIC_RESEND'));
  assert.doesNotMatch(publisher,/ATTENDANCE_TEAMS_CHAT_READ_PREFLIGHT/);
  assert.ok(publisher.includes('ATTENDANCE_NATIVE_TEAMS_SEND_GATE=ACKNOWLEDGED'));
});

test('UTC cron correctly preserves VN 06:00 and 13:00 crawl, with 06:50 and 13:50 posting',()=>{
  assert.match(workflow,/cron: "0 23 \* \* \*"/);
  assert.match(workflow,/cron: "0 6 \* \* \*"/);
  assert.doesNotMatch(workflow,/timezone:/);
  assert.match(workflow,/daily_2105\) publish_hm="06:50"/);
  assert.match(workflow,/morning_1230\) publish_hm="13:50"/);
  assert.match(workflow,/wait_seconds" -gt 3600/);
  assert.match(workflow,/timeout-minutes: 90/);
  assert.match(publisher,/status:'sending'/);
  assert.match(publisher,/GRAPH_POST_ACKNOWLEDGED/);
});

test('watchdog checks early, late, correct-target proof and exactly one bounded retry',()=>{
  for(const cron of ['12 23 * * *','30 23 * * *','42 23 * * *','10 0 * * *',
    '12 6 * * *','30 6 * * *','42 6 * * *','10 7 * * *']){
    assert.ok(watchdog.includes('cron: "'+cron+'"'));
  }
  assert.doesNotMatch(watchdog,/timezone:/);
  assert.ok(watchdog.includes('sent_wrong_target'));
  assert.ok(watchdog.includes('sent_unverified'));
  assert.ok(watchdog.includes('WATCHDOG_STAGE=receipt_reconciliation_required'));
  assert.ok(watchdog.includes('WATCHDOG_STATE=producer_pending'));
  assert.ok(watchdog.includes('WATCHDOG_STATE=self_heal_already_requested'));
  assert.ok(watchdog.includes('WATCHDOG_STATE=post_publication_retry_already_used'));
  assert.ok(watchdog.includes('WATCHDOG_STATE=existing_request_redispatched_once'));
  assert.ok(watchdog.includes('POST_PUBLICATION_RETRY_TRIGGER_MISMATCH'));
  assert.ok(watchdog.includes('git pull --ff-only origin main'));
  assert.ok(watchdog.includes('/^(?:watchdog-|self-heal-)/.test(id)'));
  assert.ok(watchdog.indexOf('WATCHDOG_STATE=verified_publication_receipt_present')<
    watchdog.indexOf('request_id="watchdog-'));
});
