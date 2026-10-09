import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LAYOUT, TEST_CHAT, ROW_VISUAL_REVISION
} from '../src/attendance-native-card.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');
const contract=JSON.parse(read('docs/attendance-v24-scope-lock.json'));
const workflow=read('.github/workflows/attendance-crawl.yml');
const watchdog=read('.github/workflows/attendance-producer-watchdog.yml');
const smoke=read('.github/workflows/attendance-production-smoke.yml');
const publisher=read('scripts/post-native-attendance-production.mjs');
const cardSource=read('src/attendance-native-card.mjs');
const io=read('src/attendance-delivery-io.mjs');

test('SCOPE LOCK: approved V24 and TEST-only destination cannot silently change',()=>{
  assert.equal(contract.schema_version,1);
  assert.equal(contract.stage,'staging');
  assert.equal(contract.layout,LAYOUT);
  assert.equal(contract.visual_revision,ROW_VISUAL_REVISION);
  assert.equal(contract.timezone,'Asia/Ho_Chi_Minh');
  assert.equal(contract.expected_employees,8);
  assert.equal(contract.delivery.mode,'test_chat_only');
  assert.equal(contract.delivery.production_channel,'NOT_CONFIGURED');
  assert.equal(contract.delivery.test_chat_id,TEST_CHAT);
  assert.ok(publisher.includes('target_chat_id:TEST_CHAT'));
  assert.ok(publisher.includes("encodeURIComponent(TEST_CHAT)+'/messages'"));
  assert.ok(!publisher.includes('TEAMS_CHANNEL_ID'));
});

test('SCOPE LOCK: crawler and publisher timing is 06:00->06:50 and 13:00->13:50',()=>{
  assert.equal(contract.slots.daily_2105.crawl,'06:00');
  assert.equal(contract.slots.daily_2105.publish,'06:50');
  assert.equal(contract.slots.daily_2105.date_rule,'yesterday');
  assert.equal(contract.slots.morning_1230.crawl,'13:00');
  assert.equal(contract.slots.morning_1230.publish,'13:50');
  assert.equal(contract.slots.morning_1230.date_rule,'today');
  for(const cron of ['0 6 * * *','0 13 * * *']){
    assert.ok(workflow.includes('cron: "'+cron+'"'));
  }
  assert.equal(workflow.split('timezone: "Asia/Ho_Chi_Minh"').length-1,2);
  assert.ok(workflow.includes('daily_2105) publish_hm="06:50"'));
  assert.ok(workflow.includes('morning_1230) publish_hm="13:50"'));
  assert.ok(workflow.includes("date -d 'yesterday' +%F"));
  assert.ok(workflow.includes('target-now-120'));
  assert.ok(workflow.includes('timeout-minutes: 90'));
});

test('SCOPE LOCK: source refresh, roster gate, browser fallback and retry are mandatory',()=>{
  const parts=[
    'Preinstall read-only Chromium fallback',
    'Crawl all attendance sources and wait for completion',
    'Wait until two minutes before Teams publication',
    'Verify browser fallback for final source refresh',
    'Recrawl all eight and require verified same-day source evidence',
    'Wait until exact Teams publication minute',
    'Publish V24 Adaptive Card to Teams'
  ];
  const locations=parts.map(value=>workflow.indexOf('- name: '+value));
  assert.ok(locations.every(n=>n>=0));
  assert.ok(locations.every((n,i)=>i===0||locations[i-1]<n));
  const after=workflow.slice(locations[4],locations[6]);
  assert.ok(after.includes('for attempt in 1 2 3'));
  assert.ok(after.includes('node scripts/attendance-crawl.mjs'));
  assert.ok(after.includes('node scripts/assert-attendance-source-ready.mjs'));
  assert.ok(after.includes('node scripts/build-report-payload.mjs'));
  assert.ok(after.includes('node scripts/validate-publication-freshness.mjs report'));
  assert.ok(after.includes('ATTENDANCE_FINAL_CRAWL_GATE=FAILED_ALL_3_ATTEMPTS'));
  assert.equal(contract.source_policy.maximum_final_crawl_attempts,3);
  assert.equal(contract.source_policy.fail_closed_on_technical_error,true);
  assert.equal(contract.source_policy.verified_absence_only,true);
});

test('SCOPE LOCK: exact-slot watchdog windows remain enabled and fail closed',()=>{
  for(const cron of [
    '12 6 * * *','30 6 * * *','42 6 * * *','10 7 * * *',
    '12 13 * * *','30 13 * * *','42 13 * * *','10 14 * * *'
  ]){
    assert.ok(watchdog.includes('cron: "'+cron+'"'));
  }
  assert.equal(watchdog.split('timezone: "Asia/Ho_Chi_Minh"').length-1,8);
  assert.ok(watchdog.includes('WATCHDOG_STATE=publication_receipt_sent'));
  assert.ok(watchdog.includes('WATCHDOG_STATE=delivery_uncertain_fail_closed'));
  assert.ok(watchdog.includes('WATCHDOG_STATE=producer_pending'));
  assert.ok(watchdog.includes('post_publication_retry_already_used'));
  assert.ok(watchdog.includes('slot_start="05:45"'));
  assert.ok(watchdog.includes('slot_start="12:45"'));
});

test('SCOPE LOCK: 2 native charts, no avatar, and reversible detail layout',()=>{
  // Color-only accepted revision: Microsoft native categoricalBlue (not turquoise)
  // remains distinct from the unchanged afternoon categoricalGreen segments.
  assert.equal(contract.visuals.morning_shift_native_color,'categoricalBlue');
  assert.equal(contract.visuals.afternoon_shift_native_color,'categoricalGreen');
  assert.equal(contract.visuals.daily_legend,
    'CẢ NGÀY · Xanh dương đậm: Sáng · Xanh lá: Chiều');
  assert.ok(cardSource.includes("color:'categoricalBlue'"));
  assert.ok(cardSource.includes("color:'categoricalGreen'"));
  assert.ok(cardSource.includes(contract.visuals.daily_legend));
  assert.ok(!cardSource.includes('categoricalTeal'));
  assert.equal(contract.visuals.chart_count,2);
  assert.equal(contract.visuals.native_adaptive_card,true);
  assert.equal(contract.visuals.embeds_avatar,false);
  assert.equal(contract.visuals.embeds_persona,false);
  assert.equal(contract.visuals.uses_image_ai,false);
  assert.equal(contract.visuals.max_card_bytes,18000);
  assert.ok(cardSource.includes("type:'Action.ToggleVisibility',title:'Xem giờ vào/ra đủ 8 nhân sự'"));
  assert.ok(cardSource.includes("type:'Action.ToggleVisibility',title:'Thu gọn chi tiết'"));
  assert.ok(cardSource.includes("isVisible:false,"));
  assert.ok(cardSource.includes("detail_close_control_outside_collapsible_panel:!morning"));
  assert.ok(cardSource.includes("graph_avatar_count:0"));
  assert.ok(cardSource.includes("native_microsoft_personas:false"));
  assert.ok(publisher.includes("if(qa.bytes>18000)"));
  assert.ok(publisher.includes("qa.graph_persona_count!==0 || qa.image_avatar_count!==0"));
});

test('SCOPE LOCK: no duplicate Teams send when ledger sent or uncertain',()=>{
  const pSent=publisher.indexOf("previous?.value?.status==='sent'");
  const pUncertain=publisher.indexOf("['sending','uncertain'].includes");
  const pToken=publisher.indexOf('const token=await delegatedToken()');
  const pSending=publisher.indexOf("status:'sending'");
  const pNetwork=publisher.indexOf('DELIVERY_UNCERTAIN_NO_AUTOMATIC_RESEND');
  assert.ok(pSent>=0&&pUncertain>pSent&&pToken>pUncertain);
  assert.ok(pSending>pToken&&pNetwork>pSending);
  assert.ok(publisher.includes("if(!/^\\d+$/.test(messageId))"));
  assert.ok(publisher.includes("await mark('sent',{message_id:messageId"));
  assert.ok(io.includes("if (retrySafe && attempt < 2"));
  assert.equal(contract.delivery.uncertain_fails_closed,true);
});

test('SCOPE LOCK: smoke test cannot post Teams or mutate its ledger',()=>{
  assert.ok(smoke.includes('name: Attendance Production Readiness Smoke (No Teams)'));
  assert.ok(smoke.includes('contents: read'));
  assert.ok(smoke.includes('slot: [daily_2105, morning_1230]'));
  // Lock the date-binding bug fixed after earlier smoke tests mistakenly
  // used yesterday for BOTH slots. Morning must always read today's source.
  assert.ok(smoke.includes('daily_2105) target='));
  assert.ok(smoke.includes("date -d 'yesterday' +%F"));
  assert.ok(smoke.includes('morning_1230) target='));
  assert.ok(smoke.includes('date +%F'));
  assert.ok(smoke.includes('SMOKE_TEAMS_POST=NOT_ATTEMPTED'));
  assert.ok(!smoke.includes('post-native-attendance-production.mjs'));
  assert.ok(!smoke.includes('MS_REFRESH_TOKEN'));
  assert.ok(!smoke.includes('ChatMessage.Send'));
  assert.equal(contract.delivery.smoke_posts_teams,false);
});

test('SCOPE LOCK: never accidentally reactivate legacy AI production posting',()=>{
  assert.ok(workflow.includes('Legacy AI visual pipeline disabled for native V24 production'));
  assert.ok(workflow.includes('Legacy AI visual validation disabled for native V24 production'));
  assert.ok(workflow.includes('Legacy AI handoff disabled for native V24 production'));
  assert.ok(!workflow.includes('attendance-ai-post.yml'));
  assert.equal(contract.visuals.uses_image_ai,false);
});
