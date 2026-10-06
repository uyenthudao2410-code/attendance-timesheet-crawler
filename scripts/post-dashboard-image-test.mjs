import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { request } from '../src/attendance-delivery-io.mjs';

const GRAPH='https://graph.microsoft.com/v1.0';
const TEST_CHAT='19:0e02d613cded448892f27d74cff19d63@thread.v2';
const trigger=JSON.parse(fs.readFileSync('.github/attendance-dashboard-image-test-trigger.json','utf8'));
const required=(n)=>{const v=String(process.env[n]||'').trim();if(!v)throw new Error('Missing '+n);return v;};
const sha256=(buf)=>createHash('sha256').update(buf).digest('hex');

async function main(){
  if(trigger.enabled!==true) throw new Error('Trigger disabled');

  const form=new URLSearchParams({
    client_id:required('MS_CLIENT_ID'),
    grant_type:'refresh_token',
    refresh_token:required('MS_REFRESH_TOKEN'),
    scope:'offline_access https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/Files.Read https://graph.microsoft.com/User.Read'
  });
  const secret=String(process.env.MS_CLIENT_SECRET||'').trim();
  if(secret) form.set('client_secret',secret);

  const auth=await request(`https://login.microsoftonline.com/${encodeURIComponent(required('MS_TENANT_ID'))}/oauth2/v2.0/token`,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:form
  },{retrySafe:true});
  if(!auth.ok) throw new Error('TOKEN_REFRESH_HTTP_'+auth.status);
  const token=(await auth.json()).access_token;
  if(!token) throw new Error('Missing access token');
  const headers={Authorization:`Bearer ${token}`};

  const endpoint=`${GRAPH}/drives/${encodeURIComponent(trigger.drive_id)}/items/${encodeURIComponent(trigger.item_id)}`;
  const metaR=await request(`${endpoint}?$select=id,name,size,file`,{headers},{retrySafe:true});
  if(!metaR.ok) throw new Error('IMAGE_METADATA_HTTP_'+metaR.status);
  const meta=await metaR.json();
  if(meta.name!==trigger.file_name||!meta.file) throw new Error('Image metadata mismatch');

  const fileR=await request(`${endpoint}/content`,{headers},{retrySafe:true});
  if(!fileR.ok) throw new Error('IMAGE_DOWNLOAD_HTTP_'+fileR.status);
  const image=Buffer.from(await fileR.arrayBuffer());
  if(image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw new Error('Not PNG');
  if(sha256(image)!==trigger.image_sha256) throw new Error('Image SHA mismatch');
  const width=image.readUInt32BE(16), height=image.readUInt32BE(20);
  if(width!==1080||height!==1500) throw new Error(`Unexpected dimensions ${width}x${height}`);

  const payload={
    body:{
      contentType:'html',
      content:[
        '<b>📊 [TEST V5] BÁO CÁO CHẤM CÔNG — CẢ NGÀY</b>',
        '<br>📅 Thứ Hai, 05/10/2026 · Cập nhật 10:19',
        '<br><b>8 nhân sự · 8 có dữ liệu · 6 đã chốt · 2 cần kiểm tra · Tổng 50h40</b>',
        '<br><br>',
        '<img src="../hostedContents/1/$value" width="900" alt="Dashboard chấm công V5">',
        '<br><br><i>Dashboard deterministic từ dữ liệu nguồn · Không dùng AI Image.</i>'
      ].join('')
    },
    hostedContents:[{
      '@microsoft.graph.temporaryId':'1',
      contentBytes:image.toString('base64'),
      contentType:'image/png'
    }]
  };

  const response=await request(`${GRAPH}/chats/${encodeURIComponent(TEST_CHAT)}/messages`,{
    method:'POST',
    headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  const body=await response.text();
  if(!response.ok) throw new Error(`TEAMS_SEND_HTTP_${response.status}: ${body}`);
  const sent=JSON.parse(body);
  console.log('ATTENDANCE_DASHBOARD_V5_TEST=SUCCESS');
  console.log('ATTENDANCE_DASHBOARD_V5_MESSAGE_ID='+sent.id);
  console.log(`ATTENDANCE_DASHBOARD_V5_IMAGE=${width}x${height}`);
  console.log('ATTENDANCE_DASHBOARD_V5_SHA256='+trigger.image_sha256);
}

main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
