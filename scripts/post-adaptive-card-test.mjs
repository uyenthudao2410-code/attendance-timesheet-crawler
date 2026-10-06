import fs from 'node:fs';
import { chromium } from 'playwright';

const GRAPH='https://graph.microsoft.com/v1.0';
const TEST_CHAT='19:0e02d613cded448892f27d74cff19d63@thread.v2';
const trigger=JSON.parse(fs.readFileSync('.github/attendance-adaptive-card-test-trigger.json','utf8'));
const required=(n)=>{const v=String(process.env[n]||'').trim();if(!v)throw new Error('Missing '+n);return v;};

function minutesFromTotal(text){
  const m=String(text||'').match(/^(\d+)h(\d{2})$/);
  return m ? Number(m[1])*60+Number(m[2]) : null;
}
function parseDurations(text){
  let total=0;
  for(const m of String(text||'').matchAll(/\((\d+)h(\d{2})\)/g)){
    total += Number(m[1])*60 + Number(m[2]);
  }
  return total;
}
function recordedMinutes(e){
  return minutesFromTotal(e.total) ?? (parseDurations(e.morning)+parseDurations(e.afternoon));
}
function barColor(e){
  const s=String(e.status||'');
  if(s.includes('Cần đối soát')) return '#ef4444';
  if(s.includes('Chưa chốt')) return '#f59e0b';
  return '#16a34a';
}
function shortName(name){
  const p=String(name).trim().split(/\s+/);
  if(p.length<=2) return name;
  return p.slice(-2).join(' ');
}
function liveGapUrl(){
  const params=new URLSearchParams();
  params.set('ai_template','gpt');
  params.set('type','bar');
  params.set('labels',trigger.employees.map(e=>shortName(e.name)).join(','));
  params.set('data',trigger.employees.map(e=>(Math.round(recordedMinutes(e)/6)/10).toFixed(1)).join(','));
  params.set('colors',trigger.employees.map(barColor).join('|'));
  return 'https://charts.livegap.com/v2/app.php?'+params.toString();
}

async function renderLiveGapChart(){
  const url=liveGapUrl();
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({
      viewport:{width:1180,height:820},
      deviceScaleFactor:2
    });
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(6500);

    let target=null;
    let bestArea=0;

    for(const frame of page.frames()){
      const candidates=frame.locator('canvas, svg');
      const count=await candidates.count().catch(()=>0);
      for(let i=0;i<count;i++){
        const el=candidates.nth(i);
        if(!(await el.isVisible().catch(()=>false))) continue;
        const box=await el.boundingBox().catch(()=>null);
        if(!box) continue;
        const area=box.width*box.height;
        if(box.width>=360 && box.height>=180 && area>bestArea){
          target=el;
          bestArea=area;
        }
      }
    }

    if(!target){
      const iframes=page.locator('iframe');
      const iframeCount=await iframes.count().catch(()=>0);
      for(let i=0;i<iframeCount;i++){
        const el=iframes.nth(i);
        if(!(await el.isVisible().catch(()=>false))) continue;
        const box=await el.boundingBox().catch(()=>null);
        if(!box) continue;
        const area=box.width*box.height;
        if(box.width>=360 && box.height>=180 && area>bestArea){
          target=el;
          bestArea=area;
        }
      }
    }

    if(!target){
      const chartish=page.locator('[id*="chart" i], [class*="chart" i]');
      const count=await chartish.count().catch(()=>0);
      for(let i=0;i<count;i++){
        const el=chartish.nth(i);
        if(!(await el.isVisible().catch(()=>false))) continue;
        const box=await el.boundingBox().catch(()=>null);
        if(!box) continue;
        const area=box.width*box.height;
        if(box.width>=360 && box.height>=180 && area>bestArea){
          target=el;
          bestArea=area;
        }
      }
    }

    if(!target) throw new Error('LIVEGAP_CHART_ELEMENT_NOT_FOUND');

    const png=await target.screenshot({type:'png'});
    if(!png || png.length<5000) throw new Error('LIVEGAP_CHART_SCREENSHOT_TOO_SMALL');
    console.log('LIVEGAP_CHART_URL='+url);
    console.log('LIVEGAP_CHART_BYTES='+png.length);
    return {png,url};
  } finally {
    await browser.close();
  }
}

function kpi(label,value,color){
  return {
    type:'Column',
    width:'stretch',
    items:[
      {type:'TextBlock',text:String(value),size:'ExtraLarge',weight:'Bolder',horizontalAlignment:'Center',color,spacing:'None'},
      {type:'TextBlock',text:label,size:'Small',weight:'Bolder',horizontalAlignment:'Center',color,wrap:true,spacing:'None'}
    ]
  };
}
function styleFor(e){
  const s=String(e.status||'');
  if(s.includes('Cần đối soát')) return 'attention';
  if(s.includes('Chưa chốt')) return 'warning';
  return 'good';
}
function colorFor(e){
  const s=String(e.status||'');
  if(s.includes('Cần đối soát')) return 'Attention';
  if(s.includes('Chưa chốt')) return 'Warning';
  return 'Good';
}
function compactShift(text){
  return String(text||'—').replace(/ \((\d+)h(\d{2})\)/g,' · $1h$2');
}
function employeeRow(e,i){
  const style=styleFor(e);
  const color=colorFor(e);
  return {
    type:'Container',
    style,
    spacing:i===0?'Small':'Small',
    items:[
      {
        type:'ColumnSet',
        spacing:'None',
        columns:[
          {
            type:'Column',
            width:2.3,
            verticalContentAlignment:'Center',
            items:[{type:'TextBlock',text:`${String(i+1).padStart(2,'0')}  ${e.name}`,size:'Small',weight:'Bolder',wrap:true,spacing:'None'}]
          },
          {
            type:'Column',
            width:2.5,
            verticalContentAlignment:'Center',
            items:[{type:'TextBlock',text:`Sáng  ${compactShift(e.morning)}`,size:'Small',wrap:true,spacing:'None'}]
          },
          {
            type:'Column',
            width:3.2,
            verticalContentAlignment:'Center',
            items:[{type:'TextBlock',text:`Chiều  ${compactShift(e.afternoon)}`,size:'Small',wrap:true,spacing:'None'}]
          },
          {
            type:'Column',
            width:2.0,
            verticalContentAlignment:'Center',
            items:[{type:'TextBlock',text:`${e.total} · ${e.status}`,size:'Small',weight:'Bolder',color,horizontalAlignment:'Right',wrap:true,spacing:'None'}]
          }
        ]
      }
    ]
  };
}

function buildCard(livegapUrl){
  const k=trigger.kpis;
  return {
    type:'AdaptiveCard',
    version:'1.5',
    '$schema':'http://adaptivecards.io/schemas/adaptive-card.json',
    msteams:{width:'Full'},
    body:[
      {
        type:'ColumnSet',
        spacing:'None',
        columns:[
          {
            type:'Column',
            width:'stretch',
            items:[
              {type:'TextBlock',text:'BÁO CÁO CHẤM CÔNG — CẢ NGÀY',size:'Large',weight:'Bolder',wrap:true,spacing:'None'},
              {type:'TextBlock',text:trigger.date_label,size:'Small',isSubtle:true,spacing:'Small'}
            ]
          },
          {
            type:'Column',
            width:'auto',
            verticalContentAlignment:'Center',
            items:[{type:'TextBlock',text:`Cập nhật ${trigger.updated}`,size:'Small',isSubtle:true,horizontalAlignment:'Right'}]
          }
        ]
      },
      {
        type:'Container',
        style:'emphasis',
        spacing:'Medium',
        items:[
          {
            type:'ColumnSet',
            spacing:'None',
            columns:[
              kpi('Tổng nhân sự',k.total,'Accent'),
              kpi('Có dữ liệu',k.with_record,'Good'),
              kpi('Đã chốt',k.closed,'Good'),
              kpi('Cần kiểm tra',k.attention,'Attention')
            ]
          }
        ]
      },
      {
        type:'ColumnSet',
        spacing:'Small',
        columns:[
          {
            type:'Column',
            width:'stretch',
            items:[
              {type:'TextBlock',text:'TỔNG GIỜ XÁC NHẬN',size:'Small',weight:'Bolder',color:'Accent',spacing:'None'},
              {type:'TextBlock',text:trigger.total_hours,size:'Large',weight:'Bolder',spacing:'None'}
            ]
          },
          {
            type:'Column',
            width:'stretch',
            items:[
              {type:'TextBlock',text:'TỶ LỆ CÓ BẢN GHI',size:'Small',weight:'Bolder',color:'Good',spacing:'None'},
              {type:'TextBlock',text:trigger.rate,size:'Large',weight:'Bolder',spacing:'None'}
            ]
          }
        ]
      },
      {
        type:'Image',
        url:'../hostedContents/1/$value',
        size:'Stretch',
        altText:'Biểu đồ LiveGap tổng công theo nhân sự',
        spacing:'Medium',
        selectAction:{type:'Action.OpenUrl',url:livegapUrl}
      },
      {
        type:'ColumnSet',
        spacing:'Small',
        separator:true,
        columns:[
          {type:'Column',width:2.3,items:[{type:'TextBlock',text:'NHÂN SỰ',size:'Small',weight:'Bolder',color:'Accent'}]},
          {type:'Column',width:2.5,items:[{type:'TextBlock',text:'CA SÁNG',size:'Small',weight:'Bolder',color:'Accent'}]},
          {type:'Column',width:3.2,items:[{type:'TextBlock',text:'CA CHIỀU',size:'Small',weight:'Bolder',color:'Accent'}]},
          {type:'Column',width:2.0,items:[{type:'TextBlock',text:'TỔNG / TRẠNG THÁI',size:'Small',weight:'Bolder',color:'Accent',horizontalAlignment:'Right',wrap:true}]}
        ]
      },
      ...trigger.employees.map(employeeRow),
      {
        type:'Container',
        style:'attention',
        spacing:'Medium',
        items:[{type:'TextBlock',text:`⚠ Cần chú ý: ${trigger.attention_summary}`,size:'Small',weight:'Bolder',color:'Attention',wrap:true}]
      },
      {
        type:'TextBlock',
        text:'Số liệu phục vụ đối soát nội bộ · Sai lệch vui lòng phản hồi P.HC-NS.',
        size:'Small',
        isSubtle:true,
        wrap:true,
        separator:true,
        spacing:'Small'
      }
    ]
  };
}

async function main(){
  const {png,url:chartUrl}=await renderLiveGapChart();

  const form=new URLSearchParams({
    client_id:required('MS_CLIENT_ID'),
    grant_type:'refresh_token',
    refresh_token:required('MS_REFRESH_TOKEN'),
    scope:'offline_access https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read'
  });
  const secret=String(process.env.MS_CLIENT_SECRET||'').trim();
  if(secret)form.set('client_secret',secret);

  const auth=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(required('MS_TENANT_ID'))}/oauth2/v2.0/token`,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:form
  });
  if(!auth.ok)throw new Error('TOKEN_REFRESH_HTTP_'+auth.status);
  const token=(await auth.json()).access_token;
  if(!token)throw new Error('Missing access token');

  const attachmentId='attendance-card-mobile-v8';
  const payload={
    body:{contentType:'html',content:`<attachment id="${attachmentId}"></attachment>`},
    attachments:[{
      id:attachmentId,
      contentType:'application/vnd.microsoft.card.adaptive',
      contentUrl:null,
      content:JSON.stringify(buildCard(chartUrl)),
      name:null,
      thumbnailUrl:null
    }],
    hostedContents:[{
      '@microsoft.graph.temporaryId':'1',
      contentBytes:png.toString('base64'),
      contentType:'image/png'
    }]
  };

  const response=await fetch(`${GRAPH}/chats/${encodeURIComponent(TEST_CHAT)}/messages`,{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  const bodyText=await response.text();
  if(!response.ok)throw new Error(`TEAMS_CARD_HTTP_${response.status}: ${bodyText}`);
  const body=JSON.parse(bodyText);

  console.log('ATTENDANCE_ADAPTIVE_CARD_TEST=SUCCESS');
  console.log('ATTENDANCE_ADAPTIVE_CARD_LAYOUT=MOBILE_V8_LIVEGAP');
  console.log('ATTENDANCE_ADAPTIVE_CARD_MESSAGE_ID='+body.id);
  console.log('LIVEGAP_MODE=RENDERED_HOSTED_CONTENT');
}

main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
