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
function barColor(e){
  const s=String(e.status||'');
  if(s.includes('Cần đối soát')) return '#ef4444';
  if(s.includes('Chưa chốt')) return '#f59e0b';
  return '#16a34a';
}
function employeeChartUrl(){
  const labels=trigger.employees.map(e=>e.name);
  const values=trigger.employees.map(e=>Math.round(recordedMinutes(e)/6)/10);
  const totals=trigger.employees.map(e=>String(e.total||'—'));
  const colors=trigger.employees.map(barColor);
  const c={
    type:'bar',
    data:{
      labels,
      datasets:[{
        data:values,
        backgroundColor:colors,
        borderRadius:10,
        borderSkipped:false,
        barThickness:20
      }]
    },
    options:{
      indexAxis:'y',
      responsive:true,
      maintainAspectRatio:false,
      layout:{padding:{top:8,right:76,bottom:6,left:6}},
      scales:{
        x:{
          beginAtZero:true,
          suggestedMax:12,
          ticks:{display:false},
          grid:{color:'#eef2f3',drawTicks:false},
          border:{display:false}
        },
        y:{
          ticks:{color:'#0f172a',font:{size:14,weight:'bold'},padding:8},
          grid:{display:false},
          border:{display:false}
        }
      },
      plugins:{
        title:{
          display:true,
          text:'THỜI LƯỢNG GHI NHẬN THEO NHÂN SỰ',
          color:'#0f172a',
          font:{size:22,weight:'bold'},
          padding:{top:2,bottom:4}
        },
        subtitle:{
          display:true,
          text:'Xanh: đã ghi nhận · Vàng: chưa chốt · Đỏ: cần đối soát',
          color:'#64748b',
          font:{size:12},
          padding:{bottom:10}
        },
        legend:{display:false},
        datalabels:{
          anchor:'end',
          align:'right',
          offset:4,
          clamp:true,
          color:'#0f172a',
          font:{size:12,weight:'bold'},
          formatter:(v,ctx)=>totals[ctx.dataIndex]
        }
      }
    }
  };
  return 'https://quickchart.io/chart?version=4&width=900&height=520&devicePixelRatio=2&backgroundColor=white&format=png&c='+encodeURIComponent(JSON.stringify(c));
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

function detailColor(e){
  const s=String(e.status||'');
  if(s.includes('Cần đối soát')) return 'Attention';
  if(s.includes('Chưa chốt')) return 'Warning';
  return 'Good';
}

function employeeRow(e,i){
  const c=detailColor(e);
  return {
    type:'Container',
    separator:i>0,
    spacing:'Small',
    items:[
      {
        type:'ColumnSet',
        spacing:'None',
        columns:[
          {
            type:'Column',
            width:'stretch',
            items:[
              {type:'TextBlock',text:`${String(i+1).padStart(2,'0')}  **${e.name}**`,size:'Small',wrap:true,spacing:'None'}
            ]
          },
          {
            type:'Column',
            width:'auto',
            items:[
              {type:'TextBlock',text:`**${e.total}** · ${e.status}`,size:'Small',weight:'Bolder',color:c,horizontalAlignment:'Right',wrap:true,spacing:'None'}
            ]
          }
        ]
      },
      {
        type:'TextBlock',
        text:`Sáng  ${e.morning}    |    Chiều  ${e.afternoon}`,
        size:'Small',
        wrap:true,
        isSubtle:true,
        spacing:'None'
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
            items:[
              {type:'TextBlock',text:`Cập nhật ${trigger.updated}`,size:'Small',isSubtle:true,horizontalAlignment:'Right'}
            ]
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
        url:employeeChartUrl(),
        size:'Stretch',
        altText:'Biểu đồ thời lượng ghi nhận theo 8 nhân sự',
        spacing:'Medium'
      },

      {
        type:'TextBlock',
        text:'CHI TIẾT GIỜ VÀO / RA',
        size:'Small',
        weight:'Bolder',
        color:'Accent',
        separator:true,
        spacing:'Medium'
      },

      ...trigger.employees.map(employeeRow),

      {
        type:'Container',
        style:'attention',
        spacing:'Small',
        items:[
          {type:'TextBlock',text:`⚠ Cần chú ý: ${trigger.attention_summary}`,size:'Small',weight:'Bolder',color:'Attention',wrap:true}
        ]
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

  const attachmentId='attendance-card-mobile-v6';
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
  console.log('ATTENDANCE_ADAPTIVE_CARD_LAYOUT=MOBILE_V6');
  console.log('ATTENDANCE_ADAPTIVE_CARD_MESSAGE_ID='+body.id);
  console.log('QUICKCHART_MODE=REMOTE_IMAGE_URL');
}

main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
