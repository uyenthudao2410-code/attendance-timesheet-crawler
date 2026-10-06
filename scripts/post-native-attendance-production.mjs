import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

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
      'https://graph.microsoft.com/User.Read',
      'https://graph.microsoft.com/ProfilePhoto.Read.All'
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

async function appToken(){
  const secret=String(process.env.MS_CLIENT_SECRET||'').trim();
  if(!secret)return '';
  const form=new URLSearchParams({
    client_id:required('MS_CLIENT_ID'),
    client_secret:secret,
    grant_type:'client_credentials',
    scope:'https://graph.microsoft.com/.default'
  });
  const res=await request(
    'https://login.microsoftonline.com/'+encodeURIComponent(required('MS_TENANT_ID'))+'/oauth2/v2.0/token',
    {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form},
    {retrySafe:true}
  );
  if(!res.ok)return '';
  return String((await res.json()).access_token||'');
}

async function profilePhotos(source,directory,delegatedHeaders){
  const result={};
  let appHeaders=null;
  let appAttempted=false;

  for(const e of source.employees){
    const user=directory[e.name];
    if(!user)throw new Error('PROFILE_DIRECTORY_MISSING_'+e.name);
    const url=GRAPH+'/users/'+encodeURIComponent(user.id)+'/photos/48x48/$value';
    let res=await request(url,{headers:delegatedHeaders},{retrySafe:true});
    let mode='delegated';

    if([401,403].includes(res.status)){
      if(!appAttempted){
        appAttempted=true;
        const token=await appToken();
        if(token)appHeaders={Authorization:'Bearer '+token};
      }
      if(appHeaders){
        res=await request(url,{headers:appHeaders},{retrySafe:true});
        mode='application';
      }
    }

    if(res.status===404)throw new Error('PROFILE_PHOTO_MISSING_'+user.userPrincipalName);
    if(!res.ok)throw new Error('PROFILE_PHOTO_HTTP_'+res.status+'_'+user.userPrincipalName);

    const type=String(res.headers.get('content-type')||'').toLowerCase().split(';')[0].trim();
    if(!['image/jpeg','image/png'].includes(type))throw new Error('PROFILE_PHOTO_CONTENT_TYPE_'+type);

    const raw=Buffer.from(await res.arrayBuffer());
    const optimized=await sharp(raw)
      .resize(36,36,{fit:'cover',position:'centre'})
      .jpeg({quality:60,mozjpeg:true,chromaSubsampling:'4:2:0'})
      .toBuffer();
    if(!optimized.length||optimized.length>2600)throw new Error('PROFILE_PHOTO_SIZE_'+optimized.length);
    result[e.name]='data:image/jpeg;base64,'+optimized.toString('base64');
    console.log('ATTENDANCE_NATIVE_PROFILE_PHOTO='+user.userPrincipalName+':OK:'+mode+':'+raw.length+'->'+optimized.length);
  }

  if(Object.keys(result).length!==source.employees.length)throw new Error('PROFILE_PHOTO_COUNT_MISMATCH');
  return result;
}

const slot=required('ATTENDANCE_RUN_SLOT');
const date=required('TARGET_DATE');
if(!['morning_1230','daily_2105'].includes(slot))throw new Error('Unsupported attendance slot');
if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Invalid target date');

const reportPath=path.join('output','report-'+slot+'-'+date+'.json');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
if(report.slot!==slot||report.date!==date)throw new Error('BUSINESS_REPORT_BINDING_MISMATCH');

const directory=JSON.parse(fs.readFileSync('test/fixtures/attendance-user-directory.json','utf8'));
const source=businessReportToNativeSource(report);

const store=createRepoStore(required('GITHUB_REPOSITORY'),required('GITHUB_TOKEN'));
const ledgerPath='.github/attendance-publications/'+slot+'-'+date+'.json';
const previous=await store.read(ledgerPath);

if(previous?.value?.status==='sent' && /^\d+$/.test(String(previous.value.message_id||''))){
  console.log('ATTENDANCE_NATIVE_PROD=ALREADY_SENT');
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

const avatarUrls=await profilePhotos(source,directory,headers);
const card=buildNativeCard(source,directory,avatarUrls);
const qa=auditCard(card,source,directory,avatarUrls);
if(qa.graph_avatar_count!==8)throw new Error('GRAPH_AVATAR_GATE_FAILED');

console.log('ATTENDANCE_NATIVE_PROD_LAYOUT='+LAYOUT);
console.log('ATTENDANCE_NATIVE_PROD_PAYLOAD_BYTES='+qa.bytes);
console.log('ATTENDANCE_NATIVE_PROD_GRAPH_AVATARS='+qa.graph_avatar_count);

let receipt=await store.write(ledgerPath,{
  schema_version:1,
  kind:'attendance_native_adaptive_card',
  layout_version:LAYOUT,
  slot,
  target_date:date,
  status:'sending',
  source_report_sha256:digest(JSON.stringify(report)),
  card_sha256:qa.card_sha256,
  graph_avatar_count:qa.graph_avatar_count,
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
console.log('ATTENDANCE_NATIVE_PROD=SUCCESS');
