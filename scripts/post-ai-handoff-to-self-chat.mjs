import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { buildAiVisualRequest, validateAiVisualRequest } from '../src/attendance-ai-visual.mjs';
import { buildImageInput, encodeImageInput, decodeImageInput, sha256 } from '../src/attendance-image-input.mjs';
import { ATTENDANCE_AI_HANDOFF_CHAT_ID, ATTENDANCE_AI_HANDOFF_MARKER, ATTENDANCE_TEST_CHAT_ID, assertAttendanceRouteIsolation } from '../src/attendance-routing.mjs';

const GRAPH='https://graph.microsoft.com/v1.0';
assertAttendanceRouteIsolation();
if(ATTENDANCE_AI_HANDOFF_CHAT_ID===ATTENDANCE_TEST_CHAT_ID) throw new Error('Refusing to send attendance AI handoff to TEST publication chat');
function required(name){const value=String(process.env[name]||'').trim();if(!value)throw new Error(`Missing required environment variable: ${name}`);return value;}
const esc=(value)=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
async function accessToken(){
  const form=new URLSearchParams({client_id:required('MS_CLIENT_ID'),grant_type:'refresh_token',refresh_token:required('MS_REFRESH_TOKEN'),scope:'offline_access https://graph.microsoft.com/ChatMessage.Send'});
  const secret=String(process.env.MS_CLIENT_SECRET||'').trim();if(secret)form.set('client_secret',secret);
  const response=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(required('MS_TENANT_ID'))}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
  if(!response.ok)throw new Error(`Microsoft token refresh failed: HTTP ${response.status}`);
  const token=String((await response.json()).access_token||'').trim();if(!token)throw new Error('Missing Microsoft access token');return token;
}
const slot=required('ATTENDANCE_RUN_SLOT'),date=required('TARGET_DATE'),requestId=required('ATTENDANCE_REQUEST_ID');
if(!['morning_1230','daily_2105'].includes(slot)||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Invalid attendance slot/date');
const reportBytes=fs.readFileSync(path.join('output',`report-${slot}-${date}.json`),'utf8');
const report=JSON.parse(reportBytes);
if(report.request_id!==requestId||report.slot!==slot||report.date!==date)throw new Error('Canonical report does not belong to this request');
const request=JSON.parse(fs.readFileSync(path.join('output',`ai-visual-request-${slot}-${date}.json`),'utf8'));
validateAiVisualRequest(request,report);
// Do not trust a count/total-only validation: rebuild and compare every field.
const expected=buildAiVisualRequest(report);
const input=buildImageInput(request,report,expected,sha256(reportBytes));
const encoded=encodeImageInput(input);
if(!isDeepStrictEqual(decodeImageInput(encoded),input))throw new Error('Image input transport round-trip failed');
const inputPath=path.join('output',`chatgpt-image-input-${slot}-${date}.json`);
const promptPath=path.join('output',`chatgpt-image-prompt-${slot}-${date}.txt`);
fs.writeFileSync(inputPath,JSON.stringify(input,null,2)+'\n',{mode:0o600});
fs.writeFileSync(promptPath,input.generation_prompt,{mode:0o600});
const meta=[
  ATTENDANCE_AI_HANDOFF_MARKER,`REQUEST_ID=${requestId}`,`SLOT=${slot}`,`TARGET_DATE=${date}`,
  `CREATED_AT=${new Date().toISOString()}`,`INPUT_VERSION=${input.input_contract_version}`,
  `SPEC_VERSION=${input.spec_version}`,`INPUT_SHA256=${sha256(JSON.stringify(input))}`,
  `SOURCE_REPORT_SHA256=${input.source_report_sha256}`,`DATA_SHA256=${input.data_sha256}`,
  `PROMPT_SHA256=${input.generation_prompt_sha256}`,`PROMPT_BYTES=${input.generation_prompt_bytes}`,
].join('\n');
const text=[meta,'PROMPT_BEGIN',input.generation_prompt,'PROMPT_END','INPUT_GZIP_BASE64_BEGIN',encoded,'INPUT_GZIP_BASE64_END'].join('\n');
if(Buffer.byteLength(text,'utf8')>24000)throw new Error('AI handoff message exceeds safe Teams message size');
// PRE avoids HTML-to-Markdown paragraph reflow; compressed input is a lossless copy.
const html=`<pre>${esc(text)}</pre>`;
if(Buffer.byteLength(JSON.stringify({body:{contentType:'html',content:html}}),'utf8')>27000)throw new Error('Encoded handoff exceeds safe wire size');
console.log('ATTENDANCE_IMAGE_INPUT_GATE=PASS');
console.log(`ATTENDANCE_IMAGE_INPUT_DATA_SHA256=${input.data_sha256}`);
console.log(`ATTENDANCE_IMAGE_INPUT_PROMPT_SHA256=${input.generation_prompt_sha256}`);
console.log(`ATTENDANCE_IMAGE_INPUT_PROMPT_BYTES=${input.generation_prompt_bytes}`);
const response=await fetch(`${GRAPH}/chats/${encodeURIComponent(ATTENDANCE_AI_HANDOFF_CHAT_ID)}/messages`,{
  method:'POST',headers:{Authorization:`Bearer ${await accessToken()}`,'Content-Type':'application/json'},
  body:JSON.stringify({body:{contentType:'html',content:html}}),
});
if(!response.ok)throw new Error(`Teams AI handoff failed: HTTP ${response.status}`);
const result=await response.json(),messageId=String(result?.id||'').trim();
if(!messageId)throw new Error('Teams AI handoff returned no message id');
console.log(`ATTENDANCE_AI_HANDOFF_MESSAGE_ID=${messageId}`);
console.log(`ATTENDANCE_AI_HANDOFF_CHAT_ID=${ATTENDANCE_AI_HANDOFF_CHAT_ID}`);
console.log(`ATTENDANCE_AI_HANDOFF_MARKER=${ATTENDANCE_AI_HANDOFF_MARKER}`);
console.log(`ATTENDANCE_AI_HANDOFF_PROMPT_SHA256=${input.generation_prompt_sha256}`);
if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,[
  `ATTENDANCE_AI_HANDOFF_MESSAGE_ID=${messageId}`,
  `ATTENDANCE_AI_HANDOFF_PROMPT_SHA256=${input.generation_prompt_sha256}`,
  `ATTENDANCE_AI_VISUAL_PROMPT_SHA256=${input.generation_prompt_sha256}`,
  `ATTENDANCE_AI_VISUAL_PROMPT_FILE=${promptPath}`,
  `ATTENDANCE_IMAGE_INPUT_FILE=${inputPath}`,
  `ATTENDANCE_IMAGE_INPUT_DATA_SHA256=${input.data_sha256}`,
  `ATTENDANCE_IMAGE_INPUT_VERSION=${input.input_contract_version}`,'',
].join('\n'),'utf8');
