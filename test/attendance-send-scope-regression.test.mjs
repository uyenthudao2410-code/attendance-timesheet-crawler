import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const publisher=fs.readFileSync('scripts/post-native-attendance-production.mjs','utf8');
const watchdog=fs.readFileSync('.github/workflows/attendance-producer-watchdog.yml','utf8');
const audit=fs.readFileSync('.github/workflows/attendance-teams-target-audit.yml','utf8');

test('V24 delegates existing ChatMessage.Send and User.Read without newly mandatory Chat.Read',()=>{
  assert.ok(publisher.includes("'https://graph.microsoft.com/'+targetPermission"));
  assert.match(publisher,/graph[.]microsoft[.]com\/User[.]Read/);
  assert.doesNotMatch(publisher,/graph[.]microsoft[.]com\/Chat[.]Read/);
  assert.doesNotMatch(publisher,/ATTENDANCE_TEAMS_CHAT_READ_PREFLIGHT/);
  assert.match(audit,/ATTENDANCE_SEND_PREFLIGHT=PASSED/);
  assert.match(audit,/ATTENDANCE_CHAT_READ_REQUIRED=false/);
  assert.doesNotMatch(audit,/graph[.]microsoft[.]com\/Chat[.]Read/);
});

test('Graph send acknowledgement is durable and is not misrepresented as Teams readback verification',()=>{
  assert.match(publisher,/status:'sending'/);
  assert.match(publisher,/DELIVERY_UNCERTAIN_NO_AUTOMATIC_RESEND/);
  assert.match(publisher,/ATTENDANCE_SENT_RECEIPT_ID_MISSING_RECONCILE_NO_RESEND/);
  assert.match(publisher,/ATTENDANCE_ALREADY_SENT_DIFFERENT_TEAMS_DESTINATION_NO_AUTOREPOST/);
  assert.match(publisher,/ATTENDANCE_NATIVE_TEAMS_SEND_GATE=ACKNOWLEDGED/);
  assert.match(publisher,/delivery_evidence:'graph_post_2xx_message_id'/);
  assert.match(publisher,/verification_stage:'awaiting_independent_teams_readback'/);
  assert.doesNotMatch(publisher,/SUCCESS_VERIFIED/);
});

test('Watchdog stops on acknowledged delivery to official chat without claiming independent proof',()=>{
  assert.match(watchdog,/sent_acknowledged/);
  assert.match(watchdog,/delivery_evidence==='graph_post_2xx_message_id'/);
  assert.match(watchdog,/WATCHDOG_STATE=acknowledged_publication_receipt_present/);
  assert.match(watchdog,/WATCHDOG_STATE=verified_publication_receipt_present/);
  assert.match(watchdog,/Attendance Crawl\|main\|completed\|success/);
  assert.match(watchdog,/sent_wrong_target/);
  assert.match(watchdog,/sent_unverified/);
  assert.match(watchdog,/WATCHDOG_STAGE=receipt_reconciliation_required/);
});
