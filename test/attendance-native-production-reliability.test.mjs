import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/attendance-crawl.yml','utf8');
const publisher=fs.readFileSync('scripts/post-native-attendance-production.mjs','utf8');

test('early producer and final refresh run before publishing either native V24 slot',()=>{
  for(const cron of ['0 6 * * *','0 13 * * *']){
    assert.ok(workflow.includes('cron: "'+cron+'"\n      timezone: "Asia/Ho_Chi_Minh"'));
  }
  assert.ok(workflow.includes('"0 6 * * *")'));
  assert.ok(workflow.includes('"0 13 * * *")'));
  const early=workflow.indexOf('- name: Crawl all attendance sources and wait for completion');
  const wait=workflow.indexOf('- name: Wait until two minutes before Teams publication');
  const preflight=workflow.indexOf('- name: Verify browser fallback for final source refresh');
  const refresh=workflow.indexOf('- name: Recrawl all eight and require verified same-day source evidence');
  const publishWait=workflow.indexOf('- name: Wait until exact Teams publication minute');
  const publish=workflow.indexOf('- name: Publish V24 Adaptive Card to Teams');
  assert.ok(early>=0&&early<wait&&wait<preflight&&preflight<refresh&&refresh<publishWait&&publishWait<publish);
  const finalBlock=workflow.slice(refresh,publish);
  assert.ok(finalBlock.includes('node scripts/attendance-crawl.mjs'));
  assert.ok(finalBlock.includes('node scripts/assert-attendance-source-ready.mjs'));
  assert.ok(finalBlock.includes('node scripts/build-report-payload.mjs'));
  assert.ok(finalBlock.includes('node scripts/validate-publication-freshness.mjs report'));
  assert.match(finalBlock,/for attempt in 1 2 3/);
  assert.ok(finalBlock.includes('ATTENDANCE_FINAL_CRAWL_GATE=FAILED_ALL_3_ATTEMPTS'));
});

test('native V24 Teams publisher remains no-avatar and receipt/idempotency guarded',()=>{
  assert.doesNotMatch(workflow,/Install V24 profile-photo optimizer/);
  assert.match(publisher,/graph_persona_count!==0/);
  assert.match(publisher,/image_avatar_count!==0/);
  assert.match(publisher,/native_microsoft_personas!==false/);
  assert.ok(publisher.includes("previous?.value?.status==='sent'"));
  assert.ok(publisher.includes('DELIVERY_UNCERTAIN_RECONCILE_BEFORE_RESEND'));
  assert.ok(publisher.includes("status:'sending'"));
  assert.ok(publisher.includes("node scripts/post-native-attendance-production.mjs")===false);
  assert.ok(workflow.includes('node scripts/post-native-attendance-production.mjs'));
});
