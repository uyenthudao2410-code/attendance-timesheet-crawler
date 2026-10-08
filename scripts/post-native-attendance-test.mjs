import fs from 'node:fs';
import {buildNativeCard, auditCard, sourceDigest, digest, LAYOUT, TEST_CHAT} from '../src/attendance-native-card.mjs';
import {createRepoStore, request} from '../src/attendance-delivery-io.mjs';

const TRIGGER = '.github/attendance-native-card-test-trigger.json';
const FIXTURE = 'test/fixtures/attendance-native-card-input.json';
const DIRECTORY = 'test/fixtures/attendance-user-directory.json';
const GRAPH = 'https://graph.microsoft.com/v1.0';

const required = name => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

// Microsoft Graph Persona components render identity and photo natively in Teams.
// The test publisher must not fetch, crop or embed profile pictures.

let stage='input';

async function main() {
  const trigger=JSON.parse(fs.readFileSync(TRIGGER,'utf8'));
  if (trigger.enabled!==true) { console.log('ATTENDANCE_NATIVE_POST=DISABLED'); return; }
  if (
    trigger.schema_version!==1 || trigger.mode!=='TEST' || trigger.chat_id!==TEST_CHAT ||
    trigger.layout_version!==LAYOUT || !/^[a-z0-9-]{8,100}$/.test(trigger.request_id || '')
  ) throw new Error('INVALID_NATIVE_TEST_TRIGGER');

  const source=JSON.parse(fs.readFileSync(FIXTURE,'utf8'));
  const directory=JSON.parse(fs.readFileSync(DIRECTORY,'utf8'));
  if (
    trigger.source_data_sha256!==sourceDigest(source) ||
    trigger.target_date!==source.target_date ||
    trigger.source_kind!=='design_test_fixture'
  ) throw new Error('SOURCE_BINDING_MISMATCH');

  const store=createRepoStore(required('GITHUB_REPOSITORY'),required('GITHUB_TOKEN'));

  stage='deduplication';
  const current=await store.read(TRIGGER);
  if (!current || digest(JSON.stringify(current.value))!==digest(JSON.stringify(trigger))) {
    console.log('ATTENDANCE_NATIVE_POST=SUPERSEDED');
    return;
  }

  const ledgerPath=`.github/attendance-native-tests/${trigger.request_id}.json`;
  const previous=await store.read(ledgerPath);
  if (previous?.value.status==='sent' && /^\d+$/.test(previous.value.message_id || '')) {
    console.log('ATTENDANCE_NATIVE_POST=ALREADY_SENT');
    console.log(`ATTENDANCE_NATIVE_TEAMS_MESSAGE_ID=${previous.value.message_id}`);
    return;
  }
  if (previous && previous.value.status!=='rejected') {
    throw new Error('DELIVERY_UNCERTAIN_RECONCILE_BEFORE_RESEND');
  }

  stage='microsoft_auth';
  const secret=String(process.env.MS_CLIENT_SECRET || '').trim();
  const scopeCandidates=[
    'offline_access https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read https://graph.microsoft.com/ProfilePhoto.Read.All',
    'offline_access https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read https://graph.microsoft.com/User.ReadBasic.All',
    'offline_access https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read'
  ];

  let token='';
  let grantedScopeMode='';
  for (const scope of scopeCandidates) {
    const form=new URLSearchParams({
      client_id:required('MS_CLIENT_ID'),
      grant_type:'refresh_token',
      refresh_token:required('MS_REFRESH_TOKEN'),
      scope
    });
    if (secret) form.set('client_secret',secret);

    const auth=await request(
      `https://login.microsoftonline.com/${encodeURIComponent(required('MS_TENANT_ID'))}/oauth2/v2.0/token`,
      {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form},
      {retrySafe:true}
    );

    if (!auth.ok) {
      console.log(`ATTENDANCE_AUTH_SCOPE_REJECTED=${scope.split(' ').at(-1)}:HTTP_${auth.status}`);
      continue;
    }

    const authBody=await auth.json();
    token=String(authBody.access_token || '');
    if (!token) continue;
    grantedScopeMode=scope.includes('ProfilePhoto.Read.All')
      ? 'ProfilePhoto.Read.All'
      : scope.includes('User.ReadBasic.All')
        ? 'User.ReadBasic.All'
        : 'User.Read';
    console.log(`ATTENDANCE_AUTH_SCOPE_MODE=${grantedScopeMode}`);
    break;
  }
  if (!token) throw new Error('ACCESS_TOKEN_MISSING');

  const headers={Authorization:`Bearer ${token}`};

  const meResponse=await request(`${GRAPH}/me?$select=userPrincipalName,mail`,{headers},{retrySafe:true});
  if (!meResponse.ok) throw new Error(`GRAPH_ME_HTTP_${meResponse.status}`);
  const me=await meResponse.json();
  if (String(me.userPrincipalName || me.mail || '').toLowerCase()!=='info@stacorp.net') {
    throw new Error('UNEXPECTED_DELEGATED_USER');
  }

  stage='card_build';
  const card=buildNativeCard(source,directory);
  console.log(`ATTENDANCE_NATIVE_RAW_PAYLOAD_BYTES=${Buffer.byteLength(JSON.stringify(card))}`);
  const qa=auditCard(card,source,directory);
  if(qa.graph_persona_count!==8 || qa.native_microsoft_personas!==true ||
     qa.image_avatar_count!==0)throw new Error('MICROSOFT_NATIVE_PERSONA_GATE_FAILED');
  fs.mkdirSync('output-native',{recursive:true});
  fs.writeFileSync('output-native/card.json',JSON.stringify(card,null,2)+'\n');
  fs.writeFileSync('output-native/qa.json',JSON.stringify(qa,null,2)+'\n');

  console.log(`ATTENDANCE_NATIVE_DATA_GATE=${qa.data_gate}`);
  console.log(`ATTENDANCE_NATIVE_CARD_SHA256=${qa.card_sha256}`);
  console.log(`ATTENDANCE_NATIVE_PAYLOAD_BYTES=${qa.bytes}`);
  console.log(`ATTENDANCE_NATIVE_GRAPH_PERSONAS=${qa.graph_persona_count}`);

  stage='claim';
  let receipt=await store.write(ledgerPath,{
    schema_version:1,
    kind:'native_card_design_test',
    request_id:trigger.request_id,
    target_date:source.target_date,
    chat_id:TEST_CHAT,
    status:'sending',
    source_data_sha256:qa.source_data_sha256,
    card_sha256:qa.card_sha256,
    layout_version:LAYOUT,
    source_kind:'design_test_fixture',
    graph_persona_count:qa.graph_persona_count,
    graph_avatar_count:0,
    publisher_run_id:process.env.GITHUB_RUN_ID,
    render_qa:'pending_designer_and_real_teams_clients',
    claimed_at:new Date().toISOString()
  },previous?.sha,`state: claim native card test ${trigger.request_id}`);

  async function mark(status,extra={}) {
    receipt=await store.write(
      ledgerPath,
      {...receipt.value,status,...extra,updated_at:new Date().toISOString()},
      receipt.sha,
      `state: native card test ${trigger.request_id} ${status}`
    );
  }

  const id='attendance-ms-native';
  const payload={
    body:{contentType:'html',content:`<attachment id="${id}"></attachment>`},
    attachments:[{
      id,
      contentType:'application/vnd.microsoft.card.adaptive',
      contentUrl:null,
      content:JSON.stringify(card)
    }]
  };

  stage='teams_send';
  let response;
  try {
    response=await request(
      `${GRAPH}/chats/${encodeURIComponent(TEST_CHAT)}/messages`,
      {method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload)}
    );
  } catch {
    await mark('uncertain');
    throw new Error('DELIVERY_UNCERTAIN_NO_AUTOMATIC_RESEND');
  }

  if (!response.ok) {
    const status=response.status>=400 && response.status<500 && response.status!==408 ? 'rejected' : 'uncertain';
    await mark(status,{http_status:response.status});
    throw new Error(`TEAMS_HTTP_${response.status}`);
  }

  let messageId='';
  try { messageId=String((await response.json()).id || ''); } catch {}
  if (!/^\d+$/.test(messageId)) {
    await mark('uncertain');
    throw new Error('MESSAGE_ID_MISSING_NO_AUTOMATIC_RESEND');
  }

  console.log(`ATTENDANCE_NATIVE_TEAMS_MESSAGE_ID=${messageId}`);

  stage='receipt';
  await mark('sent',{message_id:messageId,published_at:new Date().toISOString()});
  console.log(`ATTENDANCE_NATIVE_LAYOUT=${LAYOUT}`);
  console.log('ATTENDANCE_NATIVE_POST=SUCCESS');
  console.log('ATTENDANCE_NATIVE_RENDER_QA=PENDING_REAL_CLIENT_VIEW');
}

try {
  await main();
} catch(error) {
  console.error(`ATTENDANCE_NATIVE_FAILURE_STAGE=${stage}`);
  console.error(error.message);
  process.exitCode=1;
}
