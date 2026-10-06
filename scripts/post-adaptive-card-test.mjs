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

function employeeStatusCounts(){
  let daGhiNhan=0, chuaChot=0, canDoiSoat=0, chuaCoBanGhi=0;
  for(const e of trigger.employees){
    if(String(e.status).includes('Cần đối soát')) canDoiSoat++;
    else if(String(e.status).includes('Chưa chốt')) chuaChot++;
    else if(String(e.status).includes('Đã ghi nhận')) daGhiNhan++;
    else chuaCoBanGhi++;
  }
  return {daGhiNhan,chuaChot,canDoiSoat,chuaCoBanGhi};
}

function barColors(){
  return trigger.employees.map(e=>{
    const st=String(e.status||'');
    if(st.includes('Cần đối soát')) return '#ef4444';
    if(st.includes('Chưa chốt')) return '#f59e0b';
    return '#16a34a';
  });
}

function totalWorkChartUrl(){
  const labels=trigger.employees.map(e=>shortName(e.name));
  const values=trigger.employees.map(e=>Math.round(recordedMinutes(e)/6)/10);
  const c={
    type:'bar',
    data:{labels,datasets:[{data:values,backgroundColor:barColors(),borderRadius:8,borderSkipped:false,maxBarThickness:42}]},
    options:{
      responsive:true,maintainAspectRatio:false,
      layout:{padding:{top:22,right:10,bottom:8,left:8}},
      scales:{
        x:{ticks:{color:'#334155',font:{size:13,weight:'bold'},maxRotation:0,minRotation:0},grid:{display:false},border:{display:false}},
        y:{beginAtZero:true,suggestedMax:12,ticks:{color:'#64748b',font:{size:12}},title:{display:true,text:'Giờ',color:'#475569',font:{size:14,weight:'bold'}},grid:{color:'#e2e8f0'},border:{display:false}}
      },
      plugins:{
        title:{display:true,text:'TỔNG CÔNG THEO NHÂN SỰ',color:'#0f172a',font:{size:22,weight:'bold'},padding:{bottom:6}},
        subtitle:{display:true,text:'Xanh: đã ghi nhận · Vàng: chưa chốt · Đỏ: cần đối soát',color:'#64748b',font:{size:13},padding:{bottom:8}},
        legend:{display:false},
        datalabels:{color:'#0f172a',anchor:'end',align:'end',offset:2,font:{size:11,weight:'bold'},formatter:(v)=>(Math.round(v*10)/10).toFixed(1)+'h'}
      }
    }
  };
  return 'https://quickchart.io/chart?version=4&width=900&height=560&devicePixelRatio=2&backgroundColor=white&format=png&c='+encodeURIComponent(JSON.stringify(c));
}

function statusSummaryChartUrl(){
  const cts=employeeStatusCounts();
  const c={
    type:'bar',
    data:{
      labels:['Đã ghi nhận','Chưa chốt','Cần đối soát','Chưa có bản ghi'],
      datasets:[{data:[cts.daGhiNhan,cts.chuaChot,cts.canDoiSoat,cts.chuaCoBanGhi],backgroundColor:['#16a34a','#f59e0b','#ef4444','#94a3b8'],borderRadius:9,borderSkipped:false,maxBarThickness:24}]
    },
    options:{
      indexAxis:'y',responsive:true,maintainAspectRatio:false,
      layout:{padding:{top:8,right:24,bottom:4,left:8}},
      scales:{
        x:{beginAtZero:true,suggestedMax:8,ticks:{precision:0,color:'#64748b',font:{size:12}},grid:{color:'#e2e8f0'},border:{display:false}},
        y:{ticks:{color:'#334155',font:{size:13,weight:'bold'}},grid:{display:false},border:{display:false}}
      },
      plugins:{
        title:{display:true,text:'TRẠNG THÁI TỔNG QUAN',color:'#0f172a',font:{size:18,weight:'bold'},padding:{bottom:6}},
        legend:{display:false},
        datalabels:{color:'#0f172a',anchor:'end',align:'right',font:{size:12,weight:'bold'}}
      }
    }
  };
  return 'https://quickchart.io/chart?version=4&width=760&height=300&devicePixelRatio=2&backgroundColor=white&format=png&c='+encodeURIComponent(JSON.stringify(c));
}

function kpiMini(icon,label,value,color){
  return {
    type:'Container',
    style:'emphasis',
    bleed:false,
    items:[
      {type:'TextBlock',text:icon,size:'Small',horizontalAlignment:'Center'},
      {type:'TextBlock',text:String(value),size:'Large',weight:'Bolder',horizontalAlignment:'Center',color},
      {type:'TextBlock',text:label,size:'Small',weight:'Bolder',horizontalAlignment:'Center',color,wrap:true,spacing:'None'}
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
  return {
    type:'AdaptiveCard',
    version:'1.5',
    '$schema':'http://adaptivecards.io/schemas/adaptive-card.json',
    msteams:{width:'Full'},
    body:[
      {type:'TextBlock',text:'BÁO CÁO NHÂN SỰ',size:'Small',weight:'Bolder',color:'Good',spacing:'None'},
      {type:'TextBlock',text:'BÁO CÁO CHẤM CÔNG — CẢ NGÀY',size:'Large',weight:'Bolder',wrap:true,spacing:'Small'},
      {
        type:'ColumnSet',spacing:'Small',
        columns:[
          {type:'Column',width:'stretch',items:[{type:'TextBlock',text:`📅 ${trigger.date_label}`,size:'Small',weight:'Bolder',wrap:true}]},
          {type:'Column',width:'auto',items:[{type:'TextBlock',text:`🕘 ${trigger.updated}`,size:'Small',isSubtle:true,horizontalAlignment:'Right'}]}
        ]
      },
      {
        type:'ColumnSet',spacing:'Small',
        columns:[
          {type:'Column',width:'stretch',items:[kpiMini('👥','Tổng nhân sự',trigger.kpis.total,'Accent')]},
          {type:'Column',width:'stretch',items:[kpiMini('✅','Có dữ liệu',trigger.kpis.with_record,'Good')]},
          {type:'Column',width:'stretch',items:[kpiMini('✔️','Đã chốt',trigger.kpis.closed,'Good')]},
          {type:'Column',width:'stretch',items:[kpiMini('⚠️','Cần kiểm tra',trigger.kpis.attention,'Attention')]}
        ]
      },
      {
        type:'ColumnSet',spacing:'Small',
        columns:[
          {type:'Column',width:'stretch',items:[{type:'Container',style:'accent',items:[
            {type:'TextBlock',text:'TỔNG GIỜ XÁC NHẬN',size:'Small',weight:'Bolder',color:'Light'},
            {type:'TextBlock',text:trigger.total_hours,size:'ExtraLarge',weight:'Bolder',color:'Light',spacing:'Small'}
          ]}]},
          {type:'Column',width:'stretch',items:[{type:'Container',style:'good',items:[
            {type:'TextBlock',text:'TỶ LỆ CÓ BẢN GHI',size:'Small',weight:'Bolder',color:'Light'},
            {type:'TextBlock',text:trigger.rate,size:'ExtraLarge',weight:'Bolder',color:'Light',spacing:'Small'}
          ]}]}
        ]
      },
      {type:'Image',url:totalWorkChartUrl(),size:'Stretch',altText:'Biểu đồ tổng công theo nhân sự',spacing:'Medium'},
      {
        type:'ColumnSet',spacing:'Medium',
        columns:[
          {type:'Column',width:'stretch',items:[{type:'Image',url:statusSummaryChartUrl(),size:'Stretch',altText:'Biểu đồ trạng thái tổng quan'}]},
          {type:'Column',width:'stretch',items:[
            {type:'Container',style:'attention',items:[
              {type:'TextBlock',text:'CẦN CHÚ Ý',size:'Small',weight:'Bolder',color:'Attention'},
              {type:'TextBlock',text:trigger.attention_summary,wrap:true,spacing:'Small',weight:'Bolder'}
            ]},
            {type:'Container',style:'emphasis',spacing:'Small',items:[
              {type:'TextBlock',text:'TÓM TẮT NHANH',size:'Small',weight:'Bolder',color:'Accent'},
              {type:'FactSet',facts:[
                {title:'Tổng nhân sự',value:String(trigger.kpis.total)},
                {title:'Đã chốt',value:String(trigger.kpis.closed)},
                {title:'Cần kiểm tra',value:String(trigger.kpis.attention)},
                {title:'Có dữ liệu',value:String(trigger.kpis.with_record)}
              ]}
            ]}
          ]}
        ]
      },
      {type:'TextBlock',text:'8 NHÂN SỰ',size:'Small',weight:'Bolder',color:'Accent',separator:true,spacing:'Medium'},
      ...trigger.employees.map(employeeCompact),
      {type:'TextBlock',text:'ℹ️ Số liệu phục vụ đối soát nội bộ. Sai lệch vui lòng phản hồi P.HC-NS.',wrap:true,size:'Small',isSubtle:true,separator:true,spacing:'Medium'}
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

  const attachmentId='attendance-card-mobile-v4';
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
  console.log('ATTENDANCE_ADAPTIVE_CARD_LAYOUT=MOBILE_V4');
  console.log('ATTENDANCE_ADAPTIVE_CARD_MESSAGE_ID='+body.id);
  console.log('QUICKCHART_MODE=REMOTE_IMAGE_URL');
}

main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
