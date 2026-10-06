import fs from 'node:fs';

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

function shortName(name){
  const parts=String(name).trim().split(/\s+/);
  if(parts.length<=2)return name;
  return parts.slice(-2).join(' ');
}

function quickChartUrl(){
  const labels=trigger.employees.map(e=>shortName(e.name));
  const values=trigger.employees.map(e=>Math.round(recordedMinutes(e)/6)/10);
  const colors=trigger.employees.map(e=>e.attention?'#f59e0b':'#16a34a');
  const totals=trigger.employees.map(e=>e.total);

  const c={
    type:'bar',
    data:{
      labels,
      datasets:[{
        data:values,
        backgroundColor:colors,
        borderRadius:9,
        barThickness:20
      }]
    },
    options:{
      indexAxis:'y',
      responsive:true,
      maintainAspectRatio:false,
      layout:{padding:{top:8,right:48,bottom:4,left:6}},
      scales:{
        x:{
          beginAtZero:true,
          suggestedMax:12,
          ticks:{display:false},
          grid:{display:false},
          border:{display:false}
        },
        y:{
          ticks:{color:'#0f172a',font:{size:15,weight:'bold'}},
          grid:{display:false},
          border:{display:false}
        }
      },
      plugins:{
        title:{
          display:true,
          text:'TỔNG CÔNG THEO NHÂN SỰ',
          color:'#0f172a',
          font:{size:24,weight:'bold'},
          padding:{top:2,bottom:6}
        },
        subtitle:{
          display:true,
          text:'Xanh: đã ghi nhận · Vàng: cần kiểm tra / chưa chốt',
          color:'#64748b',
          font:{size:14},
          padding:{bottom:10}
        },
        legend:{display:false},
        datalabels:{
          anchor:'end',
          align:'right',
          color:'#0f172a',
          font:{size:14,weight:'bold'},
          formatter:(value,ctx)=>totals[ctx.dataIndex]
        }
      }
    }
  };
  return 'https://quickchart.io/chart?version=4&width=820&height=560&devicePixelRatio=2&backgroundColor=white&format=png&c='+encodeURIComponent(JSON.stringify(c));
}

function kpiCell(icon,label,value,color='Accent'){
  return {
    type:'Container',
    style:'emphasis',
    items:[
      {type:'TextBlock',text:`${icon}  ${label}`,size:'Small',weight:'Bolder',color,wrap:true},
      {type:'TextBlock',text:String(value),size:'Large',weight:'Bolder',spacing:'Small'}
    ]
  };
}

function kpiRow(a,b){
  return {
    type:'ColumnSet',
    spacing:'Small',
    columns:[
      {type:'Column',width:'stretch',items:[a]},
      {type:'Column',width:'stretch',items:[b]}
    ]
  };
}

function employeeCompact(e,i){
  return {
    type:'ColumnSet',
    separator:i>0,
    spacing:'Small',
    columns:[
      {
        type:'Column',
        width:'stretch',
        items:[
          {type:'TextBlock',text:`${String(i+1).padStart(2,'0')}  **${e.name}**`,wrap:true,size:'Small'}
        ]
      },
      {
        type:'Column',
        width:'auto',
        items:[
          {type:'TextBlock',text:`**${e.total}**`,horizontalAlignment:'Right',size:'Small',color:e.attention?'Attention':'Good'}
        ]
      },
      {
        type:'Column',
        width:'auto',
        items:[
          {type:'TextBlock',text:e.status,horizontalAlignment:'Right',size:'Small',weight:'Bolder',color:e.attention?'Attention':'Good',wrap:true}
        ]
      }
    ]
  };
}

function buildCard(){
  const k=trigger.kpis;
  return {
    type:'AdaptiveCard',
    version:'1.5',
    '$schema':'http://adaptivecards.io/schemas/adaptive-card.json',
    msteams:{width:'Full'},
    body:[
      {type:'TextBlock',text:'BÁO CÁO NHÂN SỰ',size:'Small',weight:'Bolder',color:'Good',spacing:'None'},
      {type:'TextBlock',text:'BÁO CÁO CHẤM CÔNG — CẢ NGÀY',size:'Large',weight:'Bolder',wrap:true,spacing:'Small'},
      {
        type:'ColumnSet',
        spacing:'Small',
        columns:[
          {type:'Column',width:'stretch',items:[{type:'TextBlock',text:`📅 ${trigger.date_label}`,size:'Small',weight:'Bolder',wrap:true}]},
          {type:'Column',width:'auto',items:[{type:'TextBlock',text:`🕘 ${trigger.updated}`,size:'Small',isSubtle:true,horizontalAlignment:'Right'}]}
        ]
      },

      kpiRow(
        kpiCell('👥','TỔNG NHÂN SỰ',k.total,'Accent'),
        kpiCell('✅','CÓ DỮ LIỆU',k.with_record,'Good')
      ),
      kpiRow(
        kpiCell('✔','ĐÃ CHỐT',k.closed,'Good'),
        kpiCell('⚠','CẦN KIỂM TRA',k.attention,'Attention')
      ),

      {
        type:'ColumnSet',
        spacing:'Small',
        columns:[
          {type:'Column',width:'stretch',items:[
            {type:'TextBlock',text:'TỔNG GIỜ XÁC NHẬN',size:'Small',weight:'Bolder',color:'Accent'},
            {type:'TextBlock',text:trigger.total_hours,size:'Large',weight:'Bolder',spacing:'Small'}
          ]},
          {type:'Column',width:'stretch',items:[
            {type:'TextBlock',text:'TỶ LỆ CÓ BẢN GHI',size:'Small',weight:'Bolder',color:'Accent'},
            {type:'TextBlock',text:trigger.rate,size:'Large',weight:'Bolder',spacing:'Small'}
          ]}
        ]
      },

      {
        type:'Image',
        url:quickChartUrl(),
        size:'Stretch',
        altText:'Biểu đồ tổng công theo nhân sự',
        spacing:'Medium'
      },

      {
        type:'Container',
        style:'attention',
        spacing:'Small',
        items:[
          {type:'TextBlock',text:`⚠ Cần chú ý: ${trigger.attention_summary}`,weight:'Bolder',color:'Attention',wrap:true,size:'Small'}
        ]
      },

      {type:'TextBlock',text:'8 NHÂN SỰ',size:'Small',weight:'Bolder',color:'Accent',separator:true,spacing:'Medium'},
      ...trigger.employees.map(employeeCompact),

      {
        type:'TextBlock',
        text:'ℹ️ Số liệu phục vụ đối soát nội bộ. Sai lệch vui lòng phản hồi P.HC-NS.',
        wrap:true,size:'Small',isSubtle:true,separator:true,spacing:'Medium'
      }
    ]
  };
}

async function main(){
  const form=new URLSearchParams({
    client_id:required('MS_CLIENT_ID'),
    grant_type:'refresh_token',
    refresh_token:required('MS_REFRESH_TOKEN'),
    scope:'offline_access https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/User.Read'
  });
  const secret=String(process.env.MS_CLIENT_SECRET||'').trim();
  if(secret)form.set('client_secret',secret);

  const auth=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(required('MS_TENANT_ID'))}/oauth2/v2.0/token`,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form
  });
  if(!auth.ok)throw new Error('TOKEN_REFRESH_HTTP_'+auth.status);

  const token=(await auth.json()).access_token;
  if(!token)throw new Error('Missing access token');

  const attachmentId='attendance-card-mobile-v3';
  const payload={
    body:{contentType:'html',content:`<attachment id="${attachmentId}"></attachment>`},
    attachments:[{
      id:attachmentId,
      contentType:'application/vnd.microsoft.card.adaptive',
      contentUrl:null,
      content:JSON.stringify(buildCard()),
      name:null,
      thumbnailUrl:null
    }]
  };

  const response=await fetch(`${GRAPH}/chats/${encodeURIComponent(TEST_CHAT)}/messages`,{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });

  const text=await response.text();
  if(!response.ok)throw new Error(`TEAMS_CARD_HTTP_${response.status}: ${text}`);

  const body=JSON.parse(text);
  console.log('ATTENDANCE_ADAPTIVE_CARD_TEST=SUCCESS');
  console.log('ATTENDANCE_ADAPTIVE_CARD_LAYOUT=MOBILE_V3');
  console.log('ATTENDANCE_ADAPTIVE_CARD_MESSAGE_ID='+body.id);
  console.log('QUICKCHART_MODE=REMOTE_IMAGE_URL');
}

main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
