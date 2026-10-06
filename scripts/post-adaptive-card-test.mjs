import fs from 'node:fs';

const GRAPH='https://graph.microsoft.com/v1.0';
const TEST_CHAT='19:0e02d613cded448892f27d74cff19d63@thread.v2';
const trigger=JSON.parse(fs.readFileSync('.github/attendance-adaptive-card-test-trigger.json','utf8'));
const required=(n)=>{const v=String(process.env[n]||'').trim();if(!v)throw new Error('Missing '+n);return v;};

function parseDurations(text){
  let total=0;
  for(const m of String(text||'').matchAll(/\((\d+)h(\d{2})\)/g)){
    total += Number(m[1]) + Number(m[2])/60;
  }
  return Math.round(total*100)/100;
}

function personHours(e){
  return Math.round((parseDurations(e.morning)+parseDurations(e.afternoon))*100)/100;
}

function quickChartUrl(){
  const labels=trigger.employees.map(e=>e.name);
  const values=trigger.employees.map(personHours);
  const colors=trigger.employees.map(e=>e.attention?'#f59e0b':'#16a34a');
  const c={
    type:'bar',
    data:{
      labels,
      datasets:[{
        label:'Giờ ghi nhận',
        data:values,
        backgroundColor:colors,
        borderRadius:10,
        barThickness:24
      }]
    },
    options:{
      indexAxis:'y',
      responsive:true,
      maintainAspectRatio:false,
      layout:{padding:{top:10,right:28,bottom:10,left:10}},
      scales:{
        x:{
          beginAtZero:true,
          suggestedMax:12,
          title:{display:true,text:'Giờ',color:'#475569',font:{size:18,weight:'bold'}},
          ticks:{color:'#64748b',font:{size:16}},
          grid:{color:'#e2e8f0'}
        },
        y:{
          ticks:{color:'#0f172a',font:{size:17,weight:'bold'}},
          grid:{display:false}
        }
      },
      plugins:{
        title:{
          display:true,
          text:'THỜI LƯỢNG GHI NHẬN THEO NHÂN SỰ',
          color:'#0f172a',
          font:{size:27,weight:'bold'},
          padding:{top:4,bottom:14}
        },
        subtitle:{
          display:true,
          text:'Xanh: đã ghi nhận · Vàng: cần kiểm tra / chưa chốt',
          color:'#64748b',
          font:{size:16},
          padding:{bottom:14}
        },
        legend:{display:false}
      }
    }
  };
  return 'https://quickchart.io/chart?version=4&width=900&height=720&devicePixelRatio=2&backgroundColor=white&format=png&c='+encodeURIComponent(JSON.stringify(c));
}

function kpiCell(icon,label,value,color='Accent'){
  return {
    type:'Container',
    style:'emphasis',
    items:[
      {type:'TextBlock',text:`${icon}  ${label}`,size:'Small',weight:'Bolder',color,wrap:true},
      {type:'TextBlock',text:String(value),size:'ExtraLarge',weight:'Bolder',spacing:'Small',color:'Default'}
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

function statusColor(e){
  return e.attention?'Attention':'Good';
}

function employeeCard(e,i){
  return {
    type:'Container',
    separator:i>0,
    spacing:'Medium',
    items:[
      {
        type:'ColumnSet',
        columns:[
          {
            type:'Column',width:'stretch',
            items:[
              {type:'TextBlock',text:`${String(i+1).padStart(2,'0')}  ${e.name}`,weight:'Bolder',wrap:true,size:'Medium'}
            ]
          },
          {
            type:'Column',width:'auto',
            items:[
              {type:'TextBlock',text:e.status,weight:'Bolder',color:statusColor(e),horizontalAlignment:'Right',wrap:true}
            ]
          }
        ]
      },
      {
        type:'TextBlock',
        text:`Sáng  ${e.morning}`,
        size:'Small',wrap:true,spacing:'Small',color:'Default'
      },
      {
        type:'TextBlock',
        text:`Chiều  ${e.afternoon}`,
        size:'Small',wrap:true,spacing:'None',color:'Default'
      },
      {
        type:'TextBlock',
        text:`Tổng công: **${e.total}**`,
        size:'Small',wrap:true,spacing:'Small',color:statusColor(e)
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
        type:'TextBlock',
        text:'BÁO CÁO NHÂN SỰ',
        size:'Small',weight:'Bolder',color:'Good',spacing:'None'
      },
      {
        type:'TextBlock',
        text:'BÁO CÁO CHẤM CÔNG — CẢ NGÀY',
        size:'ExtraLarge',weight:'Bolder',wrap:true,spacing:'Small'
      },
      {
        type:'TextBlock',
        text:'Tổng hợp từ hệ thống chấm công để đối soát',
        size:'Small',isSubtle:true,wrap:true,spacing:'Small'
      },
      {
        type:'ColumnSet',
        spacing:'Medium',
        columns:[
          {
            type:'Column',width:'stretch',
            items:[{type:'TextBlock',text:`📅  ${trigger.date_label}`,weight:'Bolder',wrap:true}]
          },
          {
            type:'Column',width:'auto',
            items:[{type:'TextBlock',text:`🕘  ${trigger.updated}`,isSubtle:true,horizontalAlignment:'Right',wrap:true}]
          }
        ]
      },

      kpiRow(
        kpiCell('👥','TỔNG NHÂN SỰ',k.total,'Accent'),
        kpiCell('✅','CÓ DỮ LIỆU',k.with_record,'Good')
      ),
      kpiRow(
        kpiCell('✔️','ĐÃ CHỐT',k.closed,'Good'),
        kpiCell('⚠️','CẦN KIỂM TRA',k.attention,'Attention')
      ),

      {
        type:'Container',
        style:'emphasis',
        spacing:'Medium',
        items:[
          {
            type:'ColumnSet',
            columns:[
              {
                type:'Column',width:'stretch',
                items:[
                  {type:'TextBlock',text:'TỔNG GIỜ XÁC NHẬN',size:'Small',weight:'Bolder',color:'Accent'},
                  {type:'TextBlock',text:trigger.total_hours,size:'ExtraLarge',weight:'Bolder',spacing:'Small'}
                ]
              },
              {
                type:'Column',width:'stretch',
                items:[
                  {type:'TextBlock',text:'TỶ LỆ CÓ BẢN GHI',size:'Small',weight:'Bolder',color:'Accent'},
                  {type:'TextBlock',text:trigger.rate,size:'ExtraLarge',weight:'Bolder',spacing:'Small'}
                ]
              }
            ]
          }
        ]
      },

      {
        type:'Image',
        url:quickChartUrl(),
        size:'Stretch',
        altText:'Biểu đồ thời lượng ghi nhận theo nhân sự',
        spacing:'Medium'
      },

      {
        type:'Container',
        style:'attention',
        spacing:'Medium',
        items:[
          {type:'TextBlock',text:`⚠️ CẦN KIỂM TRA: ${k.attention} NHÂN SỰ`,weight:'Bolder',color:'Attention',wrap:true},
          {type:'TextBlock',text:trigger.attention_summary,wrap:true,spacing:'Small'}
        ]
      },

      {
        type:'TextBlock',
        text:'CHI TIẾT CHẤM CÔNG CẢ NGÀY',
        size:'Medium',weight:'Bolder',color:'Accent',separator:true,spacing:'Large'
      },
      ...trigger.employees.map(employeeCard),

      {
        type:'TextBlock',
        text:'ℹ️ Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh.',
        wrap:true,size:'Small',isSubtle:true,separator:true,spacing:'Large'
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

  const card=buildCard();
  const attachmentId='attendance-card-mobile-v2';
  const payload={
    body:{contentType:'html',content:`<attachment id="${attachmentId}"></attachment>`},
    attachments:[{
      id:attachmentId,
      contentType:'application/vnd.microsoft.card.adaptive',
      contentUrl:null,
      content:JSON.stringify(card),
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
  console.log('ATTENDANCE_ADAPTIVE_CARD_LAYOUT=MOBILE_V2');
  console.log('ATTENDANCE_ADAPTIVE_CARD_MESSAGE_ID='+body.id);
  console.log('QUICKCHART_MODE=REMOTE_IMAGE_URL');
}

main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
