import fs from 'node:fs';
import path from 'node:path';
import {
  LAYOUT, TEST_CHAT, buildNativeCard, auditCard, digest
} from '../src/attendance-native-card.mjs';
import {businessReportToNativeSource} from '../src/attendance-native-production-source.mjs';
import {createRepoStore, request} from '../src/attendance-delivery-io.mjs';

const GRAPH='https://graph.microsoft.com/v1.0';
const EXPECTED_USER='info@stacorp.net';

const required=name=>{
  const value=String(process.env[name]||'').trim();
  if(!value)throw new Error('Missing environment variable: '+name);
  return value;
};

async function delegatedToken(){
  const form=new URLSearchParams({
    client_id:required('MS_CLIENT_ID'),
    grant_type:'refresh_token',
    refresh_token:required('MS_REFRESH_TOKEN'),
    scope:[
      'offline_access',
      'https://graph.microsoft.com/ChatMessage.Send',
      'https://graph.microsoft.com/User.Read'
    ].join(' ')
  });
  const secret=String(process.env.MS_CLIENT_SECRET||'').trim();
  if(secret)form.set('client_secret',secret);
  const res=await request(
    'https://login.microsoftonline.com/'+encodeURIComponent(required('MS_TENANT_ID'))+'/oauth2/v2.0/token',
    {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form},
    {retrySafe:true}
  );
  if(!res.ok)throw new Error('TOKEN_REFRESH_HTTP_'+res.status);
  const token=String((await res.json()).access_token||'');
  if(!token)throw new Error('ACCESS_TOKEN_MISSING');
  return token;
}

// User images and account labels are now rendered directly by the Teams
// Microsoft Graph Persona component. No photo downloads or recomposition.
// Publisher only authenticates the sending account and posts the card.

const slot=required('ATTENDANCE_RUN_SLOT');
const date=required('TARGET_DATE');
if(!['morning_1230','daily_2105'].includes(slot))throw new Error('Unsupported attendance slot');
if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Invalid target date');

// An explicitly requested re-post uses a unique design-preview ledger and
// fresh crawler data. Existing production 'sent' receipts remain immutable.
const preview=process.env.ATTENDANCE_NATIVE_PREVIEW==='true';
const requestId=String(process.env.ATTENDANCE_REQUEST_ID||'');
if(preview && (
  slot!=='morning_1230' ||
  !/^design-preview-morning_1230-\d{4}-\d{2}-\d{2}-[A-Za-z0-9-]{6,80}$/.test(requestId) ||
  !requestId.startsWith('design-preview-'+slot+'-'+date+'-')
))throw new Error('INVALID_EXPLICIT_NATIVE_PREVIEW_REQUEST');

const reportPath=path.join('output','report-'+slot+'-'+date+'.json');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
if(report.slot!==slot||report.date!==date)throw new Error('BUSINESS_REPORT_BINDING_MISMATCH');

const directory=JSON.parse(fs.readFileSync('test/fixtures/attendance-user-directory.json','utf8'));
const source=businessReportToNativeSource(report);

const store=createRepoStore(required('GITHUB_REPOSITORY'),required('GITHUB_TOKEN'));
const ledgerPath=preview
  ? '.github/attendance-native-previews/'+requestId+'.json'
  : '.github/attendance-publications/'+slot+'-'+date+'.json';
const previous=await store.read(ledgerPath);

if(previous?.value?.status==='sent' && /^\d+$/.test(String(previous.value.message_id||''))){
  console.log(preview?'ATTENDANCE_NATIVE_PREVIEW=ALREADY_SENT':'ATTENDANCE_NATIVE_PROD=ALREADY_SENT');
  console.log('ATTENDANCE_NATIVE_TEAMS_MESSAGE_ID='+previous.value.message_id);
  process.exit(0);
}
if(previous && ['sending','uncertain'].includes(String(previous.value.status||''))){
  throw new Error('DELIVERY_UNCERTAIN_RECONCILE_BEFORE_RESEND');
}

const token=await delegatedToken();
const headers={Authorization:'Bearer '+token};
const meRes=await request(GRAPH+'/me?$select=userPrincipalName,mail',{headers},{retrySafe:true});
if(!meRes.ok)throw new Error('GRAPH_ME_HTTP_'+meRes.status);
const me=await meRes.json();
if(String(me.userPrincipalName||me.mail||'').toLowerCase()!==EXPECTED_USER){
  throw new Error('UNEXPECTED_DELEGATED_USER');
}

const card=buildNativeCard(source,directory);
const qa=auditCard(card,source,directory);
if(qa.graph_persona_count!==8 || qa.image_avatar_count!==0 ||
   qa.native_microsoft_personas!==true)
  throw new Error('MICROSOFT_NATIVE_PERSONA_GATE_FAILED');

console.log('ATTENDANCE_NATIVE_PROD_LAYOUT='+LAYOUT);
if(preview)console.log('ATTENDANCE_NATIVE_PREVIEW_MODE=LIVE_DATA_SEPARATE_LEDGER');
console.log('ATTENDANCE_NATIVE_PROD_PAYLOAD_BYTES='+qa.bytes);
console.log('ATTENDANCE_NATIVE_PROD_GRAPH_PERSONAS='+qa.graph_persona_count);
console.log('ATTENDANCE_NATIVE_PROD_MANUAL_AVATARS='+qa.image_avatar_count);

let receipt=await store.write(ledgerPath,{
  schema_version:1,
  kind:preview?'attendance_native_adaptive_card_preview':'attendance_native_adaptive_card',
  ...(preview?{preview_request_id:requestId}:{}),
  layout_version:LAYOUT,
  slot,
  target_date:date,
  status:'sending',
  source_report_sha256:digest(JSON.stringify(report)),
  card_sha256:qa.card_sha256,
  graph_persona_count:qa.graph_persona_count,
  native_microsoft_personas:true,
  graph_avatar_count:0,
  publisher_run_id:process.env.GITHUB_RUN_ID,
  target_chat_id:TEST_CHAT,
  claimed_at:new Date().toISOString()
},previous?.sha,'state: claim native attendance '+slot+' '+date);

async function mark(status,extra={}){
  receipt=await store.write(
    ledgerPath,
    {...receipt.value,status,...extra,updated_at:new Date().toISOString()},
    receipt.sha,
    'state: native attendance '+slot+' '+date+' '+status
  );
}

const attachmentId='attendance-v24';
const payload={
  body:{contentType:'html',content:'<attachment id="'+attachmentId+'"></attachment>'},
  attachments:[{
    id:attachmentId,
    contentType:'application/vnd.microsoft.card.adaptive',
    contentUrl:null,
    content:JSON.stringify(card)
  }]
};

let response;
try{
  response=await request(
    GRAPH+'/chats/'+encodeURIComponent(TEST_CHAT)+'/messages',
    {method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload)}
  );
}catch{
  await mark('uncertain');
  throw new Error('DELIVERY_UNCERTAIN_NO_AUTOMATIC_RESEND');
}

if(!response.ok){
  const status=response.status>=400&&response.status<500&&response.status!==408?'rejected':'uncertain';
  await mark(status,{http_status:response.status});
  throw new Error('TEAMS_HTTP_'+response.status);
}

let messageId='';
try{messageId=String((await response.json()).id||'');}catch{}
if(!/^\d+$/.test(messageId)){
  await mark('uncertain');
  throw new Error('MESSAGE_ID_MISSING_NO_AUTOMATIC_RESEND');
}

await mark('sent',{message_id:messageId,published_at:new Date().toISOString()});
console.log('ATTENDANCE_NATIVE_TEAMS_MESSAGE_ID='+messageId);
console.log(preview?'ATTENDANCE_NATIVE_PREVIEW=SUCCESS':'ATTENDANCE_NATIVE_PROD=SUCCESS');
