import fs from 'node:fs';
import { TEAMS_HOSTED_CONTENT_LIMIT, buildTeamsHostedImagePayload } from '../src/teams-image-publisher.mjs';
import { ATTENDANCE_EXPECTED_GRAPH_USER, ATTENDANCE_TEST_CHAT_ID, validateChatGptDirectImageTrigger } from '../src/attendance-routing.mjs';
import { PUBLICATION_VERSION, digest, publicationKey, validatePublicationBinding, deliveryDecision } from '../src/attendance-publication-control.mjs';
import { request, createRepoStore } from '../src/attendance-delivery-io.mjs';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const triggerPath = '.github/attendance-ai-post-trigger.json';
const required = (name) => { const value = String(process.env[name] || '').trim(); if (!value) throw new Error(`Missing environment variable: ${name}`); return value; };
let stage = 'trigger';
async function main() {
  const trigger = JSON.parse(fs.readFileSync(triggerPath, 'utf8'));
  const validated = validateChatGptDirectImageTrigger(trigger);
  if (!validated.enabled) { console.log('ATTENDANCE_AI_POST=SKIPPED'); return; }
  const { slot, date, summary } = validated;
  const store = createRepoStore(required('GITHUB_REPOSITORY'), required('GITHUB_TOKEN'));
  stage = 'current_trigger';
  const current = await store.read(triggerPath);
  if (!current || current.value.enabled !== true || digest(JSON.stringify(current.value)) !== digest(JSON.stringify(trigger))) {
    console.log('ATTENDANCE_AI_POST=SKIPPED_SUPERSEDED'); return;
  }
  async function cleanup() {
    try {
      const latest = await store.read(triggerPath);
      if (latest && digest(JSON.stringify(latest.value)) === digest(JSON.stringify(trigger))) {
        await store.write(triggerPath, { ...trigger, enabled: false, qa_status: 'pending' }, latest.sha, 'state: reset completed attendance image trigger');
        console.log('ATTENDANCE_AI_TRIGGER_RESET=SUCCESS');
      }
    } catch { console.log('ATTENDANCE_AI_TRIGGER_RESET=RETRY_NEEDED'); }
  }
  stage = 'deduplication';
  const key = publicationKey(slot, date);
  const ledgerPath = `.github/attendance-publications/${key}.json`;
  const previous = await store.read(ledgerPath);
  if (deliveryDecision(previous?.value, key) === 'already_sent') {
    console.log('ATTENDANCE_AI_POST=ALREADY_SENT');
    console.log(`ATTENDANCE_AI_TEAMS_MESSAGE_ID=${previous.value.message_id}`);
    await cleanup(); return;
  }
  stage = 'source_binding';
  const producer = await store.read(`.github/attendance-state/${slot}.json`);
  validatePublicationBinding(trigger, producer?.value);
  await store.successfulRun(trigger.source_run_id);
  console.log('ATTENDANCE_PUBLICATION_INPUT_BINDING=PASS');

  stage = 'microsoft_auth';
  const form = new URLSearchParams({ client_id: required('MS_CLIENT_ID'), grant_type: 'refresh_token', refresh_token: required('MS_REFRESH_TOKEN'), scope: 'offline_access https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/Files.Read https://graph.microsoft.com/User.Read' });
  const secret = String(process.env.MS_CLIENT_SECRET || '').trim();
  if (secret) form.set('client_secret', secret);
  const auth = await request(`https://login.microsoftonline.com/${encodeURIComponent(required('MS_TENANT_ID'))}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form }, { retrySafe: true });
  if (!auth.ok) throw new Error(`TOKEN_REFRESH_HTTP_${auth.status}`);
  const token = (await auth.json()).access_token;
  if (!token) throw new Error('Missing Microsoft access token');
  const headers = { Authorization: `Bearer ${token}` };
  const meResponse = await request(`${GRAPH}/me?$select=userPrincipalName,mail`, { headers }, { retrySafe: true });
  if (!meResponse.ok) throw new Error(`GRAPH_ME_HTTP_${meResponse.status}`);
  const me = await meResponse.json();
  const delegatedUser = String(me.userPrincipalName || me.mail || '').toLowerCase();
  if (delegatedUser !== ATTENDANCE_EXPECTED_GRAPH_USER) throw new Error('Unexpected delegated Microsoft account');
  console.log(`GRAPH_DELEGATED_USER=${delegatedUser}`);

  stage = 'image_integrity';
  const endpoint = `${GRAPH}/drives/${encodeURIComponent(trigger.drive_id)}/items/${encodeURIComponent(trigger.item_id)}`;
  const metadataResponse = await request(`${endpoint}?$select=id,name,size,file`, { headers }, { retrySafe: true });
  if (!metadataResponse.ok) throw new Error(`IMAGE_METADATA_HTTP_${metadataResponse.status}`);
  const metadata = await metadataResponse.json();
  if (metadata.name !== trigger.file_name || !metadata.file) throw new Error('Image filename/type mismatch');
  const fileResponse = await request(`${endpoint}/content`, { headers }, { retrySafe: true });
  if (!fileResponse.ok) throw new Error(`IMAGE_DOWNLOAD_HTTP_${fileResponse.status}`);
  const image = Buffer.from(await fileResponse.arrayBuffer());
  if (image.length < 24 || image.length > TEAMS_HOSTED_CONTENT_LIMIT || image.length !== metadata.size) throw new Error('Image size mismatch');
  if (image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Final image is not PNG');
  if (digest(image) !== trigger.image_sha256) throw new Error('Uploaded image differs from QA-approved image');
  const width = image.readUInt32BE(16), height = image.readUInt32BE(20), ratio = width / height;
  if (width < 900 || height < 1400 || ratio < 0.55 || ratio > 0.78) throw new Error(`Invalid portrait dimensions: ${width}x${height}`);
  console.log('ATTENDANCE_IMAGE_SHA256_GATE=PASS');
  const payload = buildTeamsHostedImagePayload({ report: { kind: 'attendance_business_report', slot, date, summary }, imageBase64: image.toString('base64'), mode: 'TEST' });

  stage = 'claim_delivery';
  const sending = { schema_version: 1, publication_contract_version: PUBLICATION_VERSION, publication_key: key, slot, target_date: date, status: 'sending', source_run_id: trigger.source_run_id, source_request_id: trigger.source_request_id, source_handoff_message_id: trigger.source_handoff_message_id, source_prompt_sha256: trigger.source_prompt_sha256, source_data_sha256: trigger.source_data_sha256, image_sha256: trigger.image_sha256, image_origin: 'chatgpt_image', direct_output: trigger.direct_output, edited_after_generation: trigger.edited_after_generation, fallback_renderer_used: trigger.fallback_renderer_used, qa_status: trigger.qa_status, publisher_run_id: process.env.GITHUB_RUN_ID, claimed_at: new Date().toISOString() };
  let claim = await store.write(ledgerPath, sending, previous?.sha, `state: claim attendance publication ${key}`);
  async function mark(status, extra = {}) {
    claim = await store.write(ledgerPath, { ...claim.value, status, ...extra, updated_at: new Date().toISOString() }, claim.sha, `state: attendance publication ${key} ${status}`);
  }
  stage = 'teams_send';
  let response;
  try {
    response = await request(`${GRAPH}/chats/${encodeURIComponent(ATTENDANCE_TEST_CHAT_ID)}/messages`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    await mark('uncertain');
    throw new Error('DELIVERY_UNCERTAIN: do not resend before Teams reconciliation');
  }
  if (!response.ok) {
    const status = response.status >= 400 && response.status < 500 && response.status !== 408 ? 'rejected' : 'uncertain';
    await mark(status, { http_status: response.status });
    throw new Error(`TEAMS_SEND_HTTP_${response.status}: ${status}`);
  }
  let messageId;
  try { messageId = String((await response.json()).id || ''); } catch { /* Leave durable claim unresolved. */ }
  if (!/^\d+$/.test(messageId || '')) {
    await mark('uncertain'); throw new Error('DELIVERY_UNCERTAIN: response contains no message id');
  }
  console.log(`ATTENDANCE_AI_TEAMS_MESSAGE_ID=${messageId}`);
  stage = 'persist_receipt';
  await mark('sent', { message_id: messageId, published_at: new Date().toISOString(), width, height, bytes: image.length });
  console.log('ATTENDANCE_PUBLICATION_RECEIPT=STORED');
  await cleanup();
}
try { await main(); }
catch (error) {
  console.error(`ATTENDANCE_FAILURE_STAGE=${stage}`);
  console.error(String(error.message));
  process.exitCode = 1;
}
