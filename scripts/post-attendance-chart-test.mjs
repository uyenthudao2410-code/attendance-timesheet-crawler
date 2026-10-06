import fs from 'node:fs';
import crypto from 'node:crypto';
import { ATTENDANCE_EXPECTED_GRAPH_USER, ATTENDANCE_TEST_CHAT_ID } from '../src/attendance-routing.mjs';
import { request } from '../src/attendance-delivery-io.mjs';

const GRAPH='https://graph.microsoft.com/v1.0';
const trigger=JSON.parse(fs.readFileSync('.github/attendance-chart-test-trigger.json','utf8'));
const state=JSON.parse(fs.readFileSync('.github/attendance-state/daily_2105.json','utf8'));
const required=(name)=>{const v=String(process.env[name]||'').trim(); if(!v) throw new Error(`Missing environment variable: ${name}`); return v;};
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");

async function main(){
  if(trigger.schema_version!==1 || trigger.enabled!==true) throw new Error('Invalid or disabled chart test trigger');
  if(trigger.mode!=='TEST' || trigger.chat_id!==ATTENDANCE_TEST_CHAT_ID) throw new Error('TEST route mismatch');
  if(trigger.slot!=='daily_2105' || trigger.target_date!==state.target_date || state.slot!=='daily_2105') throw new Error('Producer identity mismatch');
  for(const [tk,sk] of [['source_run_id','run_id'],['source_request_id','request_id'],['source_handoff_message_id','teams_self_handoff_message_id'],['source_data_sha256','source_data_sha256']]){
    if(String(trigger[tk]||'')!==String(state[sk]||'')) throw new Error(`Source binding mismatch: ${tk}`);
  }
  if(state.input_gate!=='passed' || state.crawl_complete!==true || state.crawl_employee_count!==8) throw new Error('Producer state gate failed');
  if(!String(trigger.dashboard_url||'').startsWith('https://stargroupvn-my.sharepoint.com/')) throw new Error('Dashboard URL must stay on internal SharePoint');
  if(trigger.summary?.total_employees!==8 || trigger.summary?.with_record_count!==8 || trigger.summary?.recorded_count!==6 || trigger.summary?.attention_count!==2 || trigger.summary?.attendance_rate!==100 || trigger.summary?.total_hours_text!=='50h40') throw new Error('Unexpected chart summary');

  const form=new URLSearchParams({
    client_id:required('MS_CLIENT_ID'),
    grant_type:'refresh_token',
    refresh_token:required('MS_REFRESH_TOKEN'),
    scope:'offline_access https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read'
  });
  const secret=String(process.env.MS_CLIENT_SECRET||'').trim();
  if(secret) form.set('client_secret',secret);
  const auth=await request(`https://login.microsoftonline.com/${encodeURIComponent(required('MS_TENANT_ID'))}/oauth2/v2.0/token`,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form
  },{retrySafe:true});
  if(!auth.ok) throw new Error(`TOKEN_REFRESH_HTTP_${auth.status}`);
  const token=(await auth.json()).access_token;
  if(!token) throw new Error('Missing Microsoft access token');
  const headers={Authorization:`Bearer ${token}`};

  const meResponse=await request(`${GRAPH}/me?$select=userPrincipalName,mail`,{headers},{retrySafe:true});
  if(!meResponse.ok) throw new Error(`GRAPH_ME_HTTP_${meResponse.status}`);
  const me=await meResponse.json();
  const delegatedUser=String(me.userPrincipalName||me.mail||'').toLowerCase();
  if(delegatedUser!==ATTENDANCE_EXPECTED_GRAPH_USER) throw new Error('Unexpected delegated Microsoft account');

  const chart=fs.readFileSync('/tmp/attendance-chart-test.png');
  const sha=crypto.createHash('sha256').update(chart).digest('hex');
  console.log(`ATTENDANCE_CHART_SHA256=${sha}`);

  const s=trigger.summary;
  const body=[
    '<b>📊 [TEST] BÁO CÁO CHẤM CÔNG — CẢ NGÀY</b>',
    `<br>📅 ${esc(trigger.display_date)} · Cập nhật dữ liệu: ${esc(trigger.update_time)}`,
    `<br><b>${esc(s.with_record_count)}/${esc(s.total_employees)} có dữ liệu • ${esc(s.recorded_count)} đã chốt • ${esc(s.attention_count)} cần kiểm tra • Tổng ${esc(s.total_hours_text)}</b>`,
    '<br><br>',
    '<img src="../hostedContents/1/$value" width="900" alt="Biểu đồ trạng thái chấm công">',
    '<br><br>',
    `<a href="${esc(trigger.dashboard_url)}"><b>📋 MỞ DASHBOARD CHẤM CÔNG CHI TIẾT</b></a>`,
    '<br><i>Chart được render trực tiếp từ dữ liệu nguồn; dashboard chi tiết mở nội bộ trên Excel Online.</i>'
  ].join('');

  const payload={
    body:{contentType:'html',content:body},
    hostedContents:[{
      '@microsoft.graph.temporaryId':'1',
      contentBytes:chart.toString('base64'),
      contentType:'image/png'
    }]
  };

  const response=await request(`${GRAPH}/chats/${encodeURIComponent(ATTENDANCE_TEST_CHAT_ID)}/messages`,{
    method:'POST',
    headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  if(!response.ok){
    const t=await response.text().catch(()=> '');
    throw new Error(`TEAMS_SEND_HTTP_${response.status}: ${t.slice(0,500)}`);
  }
  const result=await response.json();
  if(!/^\d+$/.test(String(result.id||''))) throw new Error('Teams response missing message id');
  console.log(`ATTENDANCE_CHART_TEST_TEAMS_MESSAGE_ID=${result.id}`);
}

main().catch((error)=>{console.error(String(error?.stack||error));process.exitCode=1;});
