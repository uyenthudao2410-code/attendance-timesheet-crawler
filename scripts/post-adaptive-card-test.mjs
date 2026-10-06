import fs from 'node:fs';

const GRAPH='https://graph.microsoft.com/v1.0';
const TEST_CHAT='19:0e02d613cded448892f27d74cff19d63@thread.v2';
const trigger=JSON.parse(fs.readFileSync('.github/attendance-adaptive-card-test-trigger.json','utf8'));
const required=(n)=>{const v=String(process.env[n]||'').trim();if(!v)throw new Error('Missing '+n);return v;};

function quickChartUrl(){
  const c={
    type:'doughnut',
    data:{
      labels:['Đã chốt','Cần kiểm tra'],
      datasets:[{
        data:[trigger.kpis.closed,trigger.kpis.attention],
        backgroundColor:['#16a34a','#f59e0b'],
        borderColor:'#ffffff',
        borderWidth:8,
        hoverOffset:4
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      cutout:'68%',
      layout:{padding:18},
      plugins:{
        title:{
          display:true,
          text:'TÌNH TRẠNG CHẤM CÔNG',
          color:'#0f172a',
          font:{size:30,weight:'bold'},
          padding:{top:8,bottom:18}
        },
        legend:{
          position:'bottom',
          labels:{
            color:'#0f172a',
            font:{size:22,weight:'bold'},
            padding:28,
            usePointStyle:true,
            pointStyle:'circle'
          }
        }
      }
    }
  };
  return 'https://quickchart.io/chart?version=4&width=1000&height=560&devicePixelRatio=2&backgroundColor=white&format=png&c='+encodeURIComponent(JSON.stringify(c));
}

function kpiRow(a,b){
  return {
    type:'ColumnSet',
    spacing:'Medium',
    columns:[
      {
        type:'Column',width:'stretch',
        items:[{
          type:'Container',style:'emphasis',bleed:false,
          items:[
            {type:'TextBlock',text:a.label,size:'Small',weight:'Bolder',color:'Accent',wrap:true},
            {type:'TextBlock',text:String(a.value),size:'ExtraLarge',weight:'Bolder',color:'Default',spacing:'Small'}
          ]
        }]
      },
      {
        type:'Column',width:'stretch',
        items:[{
          type:'Container',style:'emphasis',bleed:false,
          items:[
            {type:'TextBlock',text:b.label,size:'Small',weight:'Bolder',color:'Accent',wrap:true},
            {type:'TextBlock',text:String(b.value),size:'ExtraLarge',weight:'Bolder',color:'Default',spacing:'Small'}
          ]
        }]
      }
    ]
  };
}

function employeeItems(){
  return trigger.employees.flatMap((e,i)=>[
    {
      type:'TextBlock',
      text:`${i+1}. **${e.name}**  ·  ${e.total}  ·  ${e.status}`,
      wrap:true,
      spacing:i===0?'Small':'Medium',
      color:e.attention?'Attention':'Default'
    },
    {
      type:'TextBlock',
      text:`Sáng: ${e.morning}   |   Chiều: ${e.afternoon}`,
      wrap:true,
      size:'Small',
      spacing:'None',
      isSubtle:true
    }
  ]);
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
        type:'Container',
        style:'accent',
        bleed:true,
        items:[
          {type:'TextBlock',text:'BÁO CÁO CHẤM CÔNG — CẢ NGÀY',size:'Large',weight:'Bolder',color:'Light',wrap:true},
          {type:'TextBlock',text:`${trigger.date_label}  ·  Cập nhật ${trigger.updated}`,spacing:'Small',color:'Light',wrap:true},
          {type:'TextBlock',text:'Dữ liệu chấm công tổng hợp để đối soát nội bộ',spacing:'Small',color:'Light',isSubtle:false,wrap:true}
        ]
      },
      kpiRow({label:'TỔNG NHÂN SỰ',value:k.total},{label:'CÓ DỮ LIỆU',value:k.with_record}),
      kpiRow({label:'ĐÃ CHỐT',value:k.closed},{label:'CẦN KIỂM TRA',value:k.attention}),
      {
        type:'Image',
        url:quickChartUrl(),
        size:'Stretch',
        altText:'Biểu đồ tình trạng chấm công'
      },
      {
        type:'ColumnSet',
        separator:true,
        spacing:'Medium',
        columns:[
          {
            type:'Column',width:'stretch',
            items:[
              {type:'TextBlock',text:'TỔNG GIỜ ĐÃ XÁC NHẬN',size:'Small',weight:'Bolder',color:'Accent'},
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
      },
      {
        type:'Container',
        style:'attention',
        spacing:'Medium',
        items:[
          {type:'TextBlock',text:`CẦN KIỂM TRA: ${k.attention} NHÂN SỰ`,weight:'Bolder',color:'Attention'},
          {type:'TextBlock',text:trigger.attention_summary,wrap:true,spacing:'Small'}
        ]
      },
      {
        type:'Container',
        id:'details',
        isVisible:false,
        separator:true,
        spacing:'Medium',
        items:[
          {type:'TextBlock',text:'CHI TIẾT 8 NHÂN SỰ',size:'Medium',weight:'Bolder',color:'Accent'},
          ...employeeItems()
        ]
      },
      {
        type:'TextBlock',
        text:'Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. Sai lệch vui lòng phản hồi P.HC-NS.',
        wrap:true,size:'Small',isSubtle:true,separator:true,spacing:'Medium'
      }
    ],
    actions:[
      {
        type:'Action.ToggleVisibility',
        title:'Xem / Ẩn chi tiết 8 nhân sự',
        targetElements:['details']
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
  const attachmentId='attendance-card';
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
  console.log('ATTENDANCE_ADAPTIVE_CARD_MESSAGE_ID='+body.id);
  console.log('QUICKCHART_MODE=REMOTE_IMAGE_URL');
}

main().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
