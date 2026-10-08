import { createHash } from 'node:crypto';

export const LAYOUT = 'ATTENDANCE_MOBILE_NATIVE_V24_BALANCED_INFO_BARS';
export const TEST_CHAT = '19:0e02d613cded448892f27d74cff19d63@thread.v2';
export const ROW_VISUAL_REVISION = 'V24_MOBILE_SINGLE_STACKED_SHIFTS_2026_10_08';

const DATA_KEYS = ['target_date','date_label','updated','kpis','total_hours','rate','attention_summary','employees'];
const fail = message => { throw new Error('NATIVE_CARD_GATE: ' + message); };

export const digest = value => createHash('sha256').update(value).digest('hex');
export const sourceDigest = s => digest(JSON.stringify(Object.fromEntries(DATA_KEYS.map(k => [k,s[k]]))));

export function durationMinutes(value) {
  const m=/^(\d+)h([0-5]\d)$/.exec(String(value));
  return m ? Number(m[1])*60 + Number(m[2]) : null;
}

export function sessionMinutes(value) {
  if (value==='—') return [];
  return value.split('; ').flatMap(session=>{
    const m=/^\d{2}:\d{2}–\d{2}:\d{2} \((\d+h[0-5]\d)\)$/.exec(session);
    if (m) return [durationMinutes(m[1])];
    if (/^(?:\d{2}:\d{2}–—|—–\d{2}:\d{2})$/.test(session)) return [];
    fail('Unknown session syntax');
  });
}

export function recordedMinutes(e) {
  return [...sessionMinutes(e.morning),...sessionMinutes(e.afternoon)].reduce((a,b)=>a+b,0);
}

export function shiftTotalMinutes(e,key) {
  return sessionMinutes(e[key]).reduce((a,b)=>a+b,0);
}

export function chartHours(minutes) {
  return Math.round(Number(minutes)/6)/10;
}

export function workdaysFromMinutes(minutes) {
  return Math.round((Number(minutes)/480)*100)/100;
}

export function formatRecordedMinutes(minutes) {
  const n=Number(minutes);
  return Math.floor(n/60)+'h'+String(n%60).padStart(2,'0');
}

export function formatWorkdays(minutes) {
  return workdaysFromMinutes(minutes).toFixed(2).replace('.',',')+' công';
}

export function validateDirectory(source,directory) {
  if (!directory || typeof directory!=='object') fail('Employee directory missing');
  for (const e of source.employees) {
    const u=directory[e.name];
    if (!u) fail('Directory user missing: '+e.name);
    if (!/^[0-9a-f-]{36}$/i.test(String(u.id||''))) fail('Invalid Entra id: '+e.name);
    if (u.displayName!==e.name) fail('Directory display name mismatch: '+e.name);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(u.userPrincipalName||''))) fail('Invalid UPN: '+e.name);
  }
  return directory;
}

export function validateSource(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s?.target_date||'')) fail('Missing report date');
  if (!/^\d{2}:\d{2}$/.test(s.updated||'')) fail('Missing source update time');
  const [yyyy,mm,dd]=s.target_date.split('-');
  if (!String(s.date_label).includes(dd+'/'+mm+'/'+yyyy)) fail('Date label mismatch');
  if (!Array.isArray(s.employees) || s.employees.length!==8 || s.kpis?.total!==8) fail('Exactly eight employees required');

  const names=new Set();
  for (const e of s.employees) {
    for (const key of ['name','morning','afternoon','total','status']) {
      if (typeof e[key]!=='string' || !e[key].trim()) fail('Missing employee '+key);
    }
    if (names.has(e.name)) fail('Duplicate employee');
    names.add(e.name);
    sessionMinutes(e.morning);
    sessionMinutes(e.afternoon);
    if (!['Đã ghi nhận','Chưa chốt','Cần đối soát','Chưa có bản ghi'].includes(e.status)) fail('Unknown status');
    if (e.total!=='Chưa chốt' && e.total!=='—' && durationMinutes(e.total)===null) fail('Invalid total');
    if (e.status==='Đã ghi nhận' && durationMinutes(e.total)===null) fail('Confirmed total missing');
  }

  const closed=s.employees.filter(e=>e.status==='Đã ghi nhận');
  const records=s.employees.filter(e=>e.morning!=='—' || e.afternoon!=='—');
  if (closed.length!==s.kpis.closed) fail('KPI/status mismatch');
  if (records.length!==s.kpis.with_record || s.rate!==String(Math.round(records.length/8*100))+'%') fail('Record KPI mismatch');
  if (durationMinutes(s.total_hours)!==closed.reduce((n,e)=>n+durationMinutes(e.total),0)) fail('Confirmed hours mismatch');
  return s;
}

const text=(value,options={})=>({type:'TextBlock',text:value,wrap:true,spacing:'None',...options});
const inline=(value,options={})=>({type:'TextRun',text:value,...options});
const rich=(inlines,options={})=>({type:'RichTextBlock',inlines,spacing:'None',...options});
const displayStatus=e=>e.status==='Cần đối soát'?'Chưa chốt':e.status;
const statusColor=e=>displayStatus(e)==='Chưa chốt'?'Warning':displayStatus(e)==='Đã ghi nhận'?'Good':'Default';
const rowStyle=e=>displayStatus(e)==='Chưa chốt'?'warning':'default';
const chartFallback=()=>text('Thiết bị này chưa hỗ trợ chart native.',{size:'Small',isSubtle:true});

const sectionTitle=(iconName,label)=>({
  type:'ColumnSet',spacing:'Medium',columns:[
    {type:'Column',width:'28px',verticalContentAlignment:'Center',
      items:[{type:'Icon',name:iconName,size:'Small',color:'Accent',fallback:'drop'}]},
    {type:'Column',width:'stretch',verticalContentAlignment:'Center',
      items:[text(label,{size:'Medium',weight:'Bolder'})]}
  ]
});

// Microsoft Teams resolves official Microsoft 365 user accounts from Entra ID.

export function overviewStatusChart(s) {
  const closed=s.employees.filter(e=>displayStatus(e)==='Đã ghi nhận').length;
  const open=s.employees.length-closed;
  return {
    type:'Chart.HorizontalBar.Stacked',
    id:'overview-status-chart',
    title:'Tổng quan trạng thái',
    showTitle:false,
    showLegend:true,
    showBarValues:true,
    spacing:'Small',
    data:[{title:'Nhân sự',data:[
      {legend:'Đã chốt',value:closed,color:'categoricalBlue'},
      {legend:'Chưa chốt',value:open,color:'categoricalGreen'}
    ]}],
    fallback:chartFallback()
  };
}

export function shiftChartLabel(e) {
  const morning=shiftTotalMinutes(e,'morning');
  const afternoon=shiftTotalMinutes(e,'afternoon');
  const fmt=minutes=>minutes>0 ? chartHours(minutes).toFixed(1) : '–';
  return fmt(morning) + ' | ' + fmt(afternoon);
}

// Source-derived labels replace a redundant detail panel for morning cards.
// Teams owns chart tooltip rendering; x/title are the only text fields.
export function attendanceChartLabel(e,scope) {
  return scope==='morning'
    ?e.name+' · '+compactShift(e.morning)+' · '+e.status:e.name;
}
// Full source names and punch times remain in horizontal Công quy đổi.
// For eight vertical columns, use the shortest unique suffix of each name.
export function verticalEmployeeNames(s) {
  const words=s.employees.map(e=>e.name.trim().split(/\s+/));
  const depths=words.map(()=>1);
  for(let pass=0;pass<20;pass++){
    const labels=words.map((w,i)=>w.slice(-depths[i]).join(' '));
    const counts=new Map();
    labels.forEach(x=>counts.set(x,(counts.get(x)||0)+1));
    if(labels.every(x=>counts.get(x)===1))return labels;
    let advanced=false;
    labels.forEach((x,i)=>{
      if(counts.get(x)>1&&depths[i]<words[i].length){depths[i]++;advanced=true;}
    });
    if(!advanced)fail('Vertical employee names are ambiguous');
  }
  fail('Too many vertical label resolution steps');
}
// Microsoft-native horizontal charts avoid clipped category names and bar
// values on mobile. Stable numeric prefixes disambiguate employee suffixes;
// full names and unchanged punch strings remain available in the details.
export function compactChartEmployeeLabel(s,i) {
  return String(i+1).padStart(2,'0')+' · '+verticalEmployeeNames(s)[i];
}

export function consolidatedShiftChart(s) {
  const labels=verticalEmployeeNames(s);
  return {
    type:'Chart.HorizontalBar',id:'workforce-shift-chart',
    color:'categoricalTeal',showTitle:false,showLegend:false,
    showBarValues:true,displayMode:'AbsoluteNoAxis',spacing:'None',
    data:s.employees.map((e,i)=>({
      x:String(i+1).padStart(2,'0')+' · '+labels[i],
      y:chartHours(shiftTotalMinutes(e,'morning')),
      color:'categoricalTeal'
    })),
    fallback:chartFallback()
  };
}

// One employee per stacked bar: morning teal + afternoon green.
// Retain exact source total in the category label to avoid ambiguity from
// native chart values rounded to a tenth of an hour.
export function consolidatedDailyShiftChart(s) {
  if(scopeOf(s)==='morning')fail('Daily stacked chart forbidden in morning scope');
  const names=verticalEmployeeNames(s);
  return {
    type:'Chart.HorizontalBar.Stacked',id:'workforce-shift-chart',
    showTitle:false,showLegend:true,showBarValues:true,
    spacing:'None',
    data:s.employees.map((e,i)=>({
      title:String(i+1).padStart(2,'0')+' · '+names[i]+' · '+
        (recordedMinutes(e)>0?formatRecordedMinutes(recordedMinutes(e)):'—'),
      data:[
        {legend:'Ca sáng',value:chartHours(shiftTotalMinutes(e,'morning')),
          color:'categoricalTeal'},
        {legend:'Ca chiều',value:chartHours(shiftTotalMinutes(e,'afternoon')),
          color:'categoricalGreen'}
      ]
    })),
    fallback:chartFallback()
  };
}

export function consolidatedWorkdayChart(s) {
  const morningOnly=scopeOf(s)==='morning';
  return {
    type:'Chart.HorizontalBar',
    id:'workforce-workdays-chart',
    showTitle:false,
    showLegend:false,
    showBarValues:true,
    displayMode:'AbsoluteNoAxis',
    color:'categoricalBlue',
    spacing:'None',
    data:s.employees.map((e,i)=>({
      x:attendanceChartLabel(e,scopeOf(s)),
      y:workdaysFromMinutes(morningOnly
        ? shiftTotalMinutes(e,'morning'):recordedMinutes(e)),
      color:'categoricalBlue'
    })),
    fallback:chartFallback()
  };
}

function compactShift(value) {
  if (value==='—') return '—';
  return String(value).replace(/ \((\d+h\d{2})\)/g,' · $1');
}


const SCOPE_MORNING='morning';
const scopeOf=s=>s.report_scope===SCOPE_MORNING || (s.report_title||'').includes('CA SÁNG')
  ? SCOPE_MORNING : 'daily';

export function workforceScales(s) {
  const maxHours=Math.max(8,...s.employees.map(e=>
    chartHours(shiftTotalMinutes(e,'morning'))+chartHours(shiftTotalMinutes(e,'afternoon'))
  ));
  const maxWorkdays=Math.max(1,...s.employees.map(e=>
    workdaysFromMinutes(recordedMinutes(e))
  ));
  return {
    shift:Math.ceil(maxHours/2)*2,
    workday:Math.ceil(maxWorkdays*2)/2
  };
}

// Native charts cannot attach a different selectAction to each data point.
// This compact index selector uses only local Adaptive Card visibility actions.

export function employeeSelectionTargets(s,index) {
  if(!Number.isInteger(index)||index<0||index>=s.employees.length)
    fail('Invalid employee index');
  return s.employees.map((e,j)=>({elementId:'p'+(j+1),isVisible:j===index}));
}

// Native account: Teams controls picture, display name, profile behavior,
// and Microsoft account styling. Never fabricate an image or reconstruct an
// email label. The Entra GUID and UPN come from the validated directory.
// Teams Graph message POST has rejected the full-day card containing eight
// interactive Graph Persona components. Preserve the exact validated Entra
// displayName and UPN in a lightweight, standard Adaptive Card RichTextBlock.
// Do not generate surrogate avatar images or invent account information.
export function microsoftNativeAccount(e,directory) {
  const user=directory[e.name];
  if(!user)fail('Microsoft directory user missing: '+e.name);
  return rich([
    inline(user.displayName,{weight:'Bolder',color:'Default'}),
    inline('\n'+user.userPrincipalName,{size:'Small',isSubtle:true})
  ],{spacing:'None'});
}

export function employeeDetailPanel(s,e,index) {
  const morningOnly=scopeOf(s)==='morning';
  const minutes=morningOnly?shiftTotalMinutes(e,'morning'):recordedMinutes(e);
  const session=v=>compactShift(v).replace(/; /g,'\n');
  return {
    type:'Container',id:'p'+(index+1),isVisible:false,
    style:'emphasis',roundedCorners:true,spacing:'Small',items:[
      rich([
        inline('Trạng thái: ',{isSubtle:true}),
        inline(e.status,{color:statusColor(e),weight:'Bolder'}),
        inline(' · '+formatWorkdays(minutes),{color:'Accent',weight:'Bolder'})
      ]),
      text('CA SÁNG · Giờ vào–ra · Thời lượng\n'+session(e.morning),
        {size:'Small'}),
      ...(morningOnly?[]:[
        text('CA CHIỀU · Giờ vào–ra · Thời lượng\n'+session(e.afternoon),
          {size:'Small'})
      ]),
      text('Tổng nguồn: '+e.total+
        ' · Ghi nhận: '+(minutes?formatRecordedMinutes(minutes):'—'),
        {size:'Small',isSubtle:true}),
      {
        type:'ActionSet',spacing:'None',actions:[{
          type:'Action.ToggleVisibility',title:'Thu gọn',
          targetElements:[{elementId:'p'+(index+1),isVisible:false}]
        }]
      }
    ]
  };
}

export function employeeAccountRow(s,e,index,directory) {
  const targetElements=employeeSelectionTargets(s,index);
  const action={type:'Action.ToggleVisibility',targetElements};
  return {
    type:'Container',id:'account-row-'+(index+1),
    spacing:index?'Small':'None',
    separator:index>0,
    selectAction:action,
    items:[{
      type:'ColumnSet',spacing:'None',columns:[
        {type:'Column',width:'stretch',
          items:[microsoftNativeAccount(e,directory)]},
        {type:'Column',width:'auto',verticalContentAlignment:'Center',
          items:[{
            type:'Icon',name:'ChevronDown',size:'Small',color:'Accent',
            selectAction:action,
            fallback:'drop'
          }]
        }
      ]
    }]
  };
}

// Only one optional expansion for the whole full-day report. This keeps the
// main chart vertically focused and avoids eight repeated per-person actions
// and panels that make Graph attachments large and difficult on mobile.
// The exact source time strings and Entra UPNs remain available to readers.
export function dailyCompactDetails(s,directory) {
  if(scopeOf(s)==='morning')fail('Daily detail panel forbidden in morning scope');
  return {
    type:'Container',id:'daily-compact-details',spacing:'Medium',items:[
      {type:'ActionSet',spacing:'None',actions:[{
        type:'Action.ToggleVisibility',title:'Xem giờ vào/ra đủ 8 nhân sự',
        targetElements:[{elementId:'daily-details-content',isVisible:true}]
      }]},
      {type:'Container',id:'daily-details-content',isVisible:false,
        style:'emphasis',spacing:'Small',roundedCorners:true,items:[
          text('CHI TIẾT CHẤM CÔNG CẢ NGÀY',{size:'Small',weight:'Bolder',color:'Accent'}),
          ...s.employees.map((e,i)=>{
            const user=directory[e.name];
            return {
              type:'Container',id:'day-person-'+(i+1),
              spacing:i?'Small':'None',separator:i>0,items:[
                rich([
                  inline(e.name,{weight:'Bolder'}),
                  inline(' · '+e.status,{color:statusColor(e)})
                ]),
                text('Sáng: '+e.morning+'\nChiều: '+e.afternoon+
                  '\nTổng: '+e.total+' · '+formatWorkdays(recordedMinutes(e)),
                  {size:'Small'}),
                text(user.userPrincipalName,{size:'Small',isSubtle:true})
              ]
            };
          }),
          {type:'ActionSet',spacing:'Small',actions:[{
            type:'Action.ToggleVisibility',title:'Thu gọn chi tiết',
            targetElements:[{elementId:'daily-details-content',isVisible:false}]
          }]}
        ]}
    ]
  };
}

export function buildNativeCard(source,directory,avatarUrls={}) {
  const s=validateSource(source),k=s.kpis;
  validateDirectory(s,directory);


  const kpis=[
    {label:'Giờ xác nhận',value:s.total_hours,style:'good',color:'Good',icon:'Clock'},
    {label:'Tổng công',value:formatWorkdays(durationMinutes(s.total_hours)),
      style:'emphasis',color:'Accent',icon:'People'},
    {label:'Công ca sáng',value:formatWorkdays(
      s.employees.flatMap(e=>sessionMinutes(e.morning)).reduce((n,v)=>n+v,0)
    ),style:'warning',color:'Warning',icon:'Calendar'},
    {label:'Tỷ lệ ghi nhận',value:s.rate,style:'good',color:'Good',icon:'CheckmarkCircle'}
  ];
  // Teams renders native Icons wider than the declared 28px rail.
  // Stack the KPI label and number separately; no shared icon/text baseline.
  // Native colored text avoids overlap on both desktop and small phones.
  const kpiTile=({label,value,style,color})=>({
    type:'Column',width:1,verticalContentAlignment:'Center',items:[{
      type:'Container',style,roundedCorners:true,minHeight:'84px',
      verticalContentAlignment:'Center',spacing:'None',items:[
        rich([
          inline('● ',{color,size:'Small'}),
          inline(label,{size:'Small',weight:'Bolder',color:'Default'})
        ],{spacing:'None'}),
        text(String(value),{
          size:'Large',weight:'Bolder',color,spacing:'Small'
        })
      ]
    }]
  });

  const morning=s.employees.flatMap(e=>sessionMinutes(e.morning)).reduce((a,b)=>a+b,0);
  const afternoon=s.employees.flatMap(e=>sessionMinutes(e.afternoon)).reduce((a,b)=>a+b,0);

  return {
    type:'AdaptiveCard',
    $schema:'https://adaptivecards.io/schemas/adaptive-card.json',
    version:'1.5',
    lang:'vi',
    msteams:{width:'Full'},

    body:[
      text(s.report_title||'BÁO CÁO CHẤM CÔNG — CẢ NGÀY',
        {size:'Large',weight:'Bolder',color:'Accent'}),
      text(s.date_label+' · Cập nhật '+s.updated,
        {size:'Small',isSubtle:true,spacing:'Small'}),
      {
        type:'Container',id:'overview',spacing:'Small',items:[
          {type:'ColumnSet',spacing:'ExtraSmall',columns:kpis.slice(0,2).map(kpiTile)},
          {type:'ColumnSet',spacing:'ExtraSmall',columns:kpis.slice(2).map(kpiTile)},
          text(k.total+' nhân sự · '+k.with_record+' có dữ liệu · '+
            k.closed+' đã chốt · '+(k.total-k.closed)+' chưa chốt',
            {size:'Small',isSubtle:true,spacing:'Small'})
        ]
      },
      sectionTitle('DataBarHorizontal','BIỂU ĐỒ CÔNG / GIỜ'),
      {
        type:'ActionSet',id:'native-tab-workday',
        isVisible:scopeOf(s)==='morning',spacing:'Small',
        actions:[
          {
            type:'Action.ToggleVisibility',title:'Theo ca',
            targetElements:[
              {elementId:'native-tab-workday',isVisible:false},
              {elementId:'native-tab-shift',isVisible:true},
              {elementId:'chart-workday',isVisible:false},
              {elementId:'chart-shift',isVisible:true}
            ]
          },
          {type:'Action.ToggleVisibility',title:'Công quy đổi',style:'positive',
            targetElements:[{elementId:'chart-workday',isVisible:true}]}
        ]
      },
      {
        type:'ActionSet',id:'native-tab-shift',
        isVisible:scopeOf(s)!=='morning',spacing:'Small',
        actions:[
          {type:'Action.ToggleVisibility',title:'Theo ca',style:'positive',
            targetElements:[{elementId:'chart-shift',isVisible:true}]},
          {
            type:'Action.ToggleVisibility',title:'Công quy đổi',
            targetElements:[
              {elementId:'native-tab-workday',isVisible:true},
              {elementId:'native-tab-shift',isVisible:false},
              {elementId:'chart-workday',isVisible:true},
              {elementId:'chart-shift',isVisible:false}
            ]
          }
        ]
      },
      {
        type:'Container',id:'chart-workday',style:'emphasis',
        isVisible:scopeOf(s)==='morning',roundedCorners:true,spacing:'Small',
        items:[
          text('Công quy đổi · 8 giờ = 1 công',
            {size:'Small',weight:'Bolder',color:'Accent'}),
          consolidatedWorkdayChart(s)
        ]
      },
      {
        type:'Container',id:'chart-shift',style:'emphasis',
        isVisible:scopeOf(s)!=='morning',roundedCorners:true,spacing:'Small',
        items:[
          text(scopeOf(s)==='morning'
            ?'CA SÁNG · Giờ xác nhận'
            :'CẢ NGÀY · Xanh ngọc: Sáng · Xanh lá: Chiều',
            {size:'Small',weight:'Bolder',color:'Accent'}),
          ...(scopeOf(s)==='morning'
            ?[consolidatedShiftChart(s)]
            :[consolidatedDailyShiftChart(s)])
        ]
      },
      ...(scopeOf(s)==='morning'?[]:[dailyCompactDetails(s,directory)])
    ]
  };
}

export function auditCard(card,source,directory,avatarUrls={}) {
  validateSource(source);
  validateDirectory(source,directory);
  const json=JSON.stringify(card);
  if (Buffer.byteLength(json)>27000) fail('Card payload budget exceeded');

  const ids=new Set(),types=[];
  const walk=v=>{
    if (typeof v==='function' || typeof v==='undefined') fail('Not pure JSON');
    if (!v || typeof v!=='object') return;
    if (v.type) types.push(v.type);
    if (v.type && v.id) {
      if (ids.has(v.id)) fail('Duplicate element id');
      ids.add(v.id);
    }
    if (['TabSet','Accordion'].includes(v.type)) {
      fail('External or nonmobile visual forbidden');
    }
    if (v.type==='Image') {
      if (typeof v.url!=='string' || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v.url)) {
        fail('Only embedded PNG/JPEG avatars allowed');
      }
    } else if ('url' in v || 'backgroundImage' in v) {
      fail('No external resources');
    }
    for (const value of Object.values(v)) walk(value);
  };
  walk(card);
  const isMorning=scopeOf(source)==='morning';
  const count=types.filter(t=>t.startsWith('Chart.')).length;
  if(count!==2)fail('Expected one shift chart and one converted workday chart');
  const panel=card.body.find(x=>x.id==='chart-shift');
  const shift=panel?.items?.find(x=>x.id==='workforce-shift-chart');
  const workday=card.body.find(x=>x.id==='chart-workday')?.items?.[1];
  if(workday?.type!=='Chart.HorizontalBar' ||
     shift?.type!==(isMorning?'Chart.HorizontalBar':'Chart.HorizontalBar.Stacked'))
    fail('Native chart type mismatch');
  if(panel?.items.some(x=>x.id==='workforce-afternoon-chart'||x.id==='shift-daypart-tabs'))
    fail('Duplicate chart or daypart selector forbidden');
  if(!isMorning){
    if(shift.showLegend!==true || shift.data.length!==8)
      fail('Stacked shift chart must contain eight rows and one legend');
    const labels=verticalEmployeeNames(source);
    for(let i=0;i<source.employees.length;i++){
      const e=source.employees[i],r=shift.data[i];
      const title=String(i+1).padStart(2,'0')+' · '+labels[i]+' · '+e.total;
      const expected=[
        {legend:'Ca sáng',value:chartHours(shiftTotalMinutes(e,'morning')),
          color:'categoricalTeal'},
        {legend:'Ca chiều',value:chartHours(shiftTotalMinutes(e,'afternoon')),
          color:'categoricalGreen'}
      ];
      if(r?.title!==title || JSON.stringify(r.data)!==JSON.stringify(expected))
        fail('Stacked shift source mismatch');
    }
  }
  if(types.filter(t=>t==='Image').length!==0)
    fail('Manually composed account images not allowed');
  const morning=scopeOf(source)==='morning';
  // Microsoft Graph chatMessage rejects unsupported interactive Persona
  // payloads with HTTP 400. Use source-verified UPN RichTextBlock in daily.
  if(types.filter(t=>t==='Component').length!==0)
    fail('Microsoft Graph Component must not appear in delegated chat payload');
  const list=card.body.find(x=>x.id==='microsoft-account-list');
  if(morning){
    if(list)fail('Morning chart cannot have an extra account section');
    const chart=card.body.find(x=>x.id==='chart-workday')?.items?.[1];
    const shift=card.body.find(x=>x.id==='chart-shift')?.items?.[1];
    if(chart?.data?.length!==8 || shift?.data?.length!==8)
      fail('Morning chart must contain eight employees');
    const labels=verticalEmployeeNames(source);
    for(let i=0;i<8;i++){
      const e=source.employees[i];
      if(chart.data[i].x!==attendanceChartLabel(e,'morning')||
         shift.data[i].x!==String(i+1).padStart(2,'0')+' · '+labels[i]||
         shift.data[i].y!==chartHours(shiftTotalMinutes(e,'morning'))||
         shift.data[i].color!=='categoricalTeal')
        fail('Morning chart source mismatch');
    }
  }else{
    if(list)fail('Daily card must not contain eight duplicate profile panels');
    if(card.body.find(x=>x.id==='chart-shift')?.isVisible!==true ||
       card.body.find(x=>x.id==='chart-workday')?.isVisible!==false)
      fail('Daily card must initially show shift chart');
    const details=card.body.find(x=>x.id==='daily-compact-details');
    const content=details?.items?.find(x=>x.id==='daily-details-content');
    if(content?.isVisible!==false ||
      content.items.filter(x=>/^day-person-[1-8]$/.test(x.id||'')).length!==8)
      fail('Daily compact details must hide eight intact employee rows');
    for(let i=0;i<8;i++){
      const e=source.employees[i];
      const account=directory[e.name];
      const row=content.items.find(x=>x.id==='day-person-'+(i+1));
      const jsonRow=JSON.stringify(row);
      if(!jsonRow.includes(e.name)||!jsonRow.includes(e.status)||
         !jsonRow.includes(e.morning)||!jsonRow.includes(e.afternoon)||
         !jsonRow.includes(e.total)||!jsonRow.includes(account.userPrincipalName))
        fail('Daily compact row missing source attendance field');
    }
  }

  if (json!==JSON.stringify(buildNativeCard(source,directory,avatarUrls))) fail('Layout/data mismatch');

  return {
    layout_version:LAYOUT,
    visual_revision:ROW_VISUAL_REVISION,
    source_kind:'verified_Entra_UPN_attendance',
    target_date:source.target_date,
    source_data_sha256:sourceDigest(source),
    card_sha256:digest(json),
    bytes:Buffer.byteLength(json),
    employee_count:source.employees.length,
    kpi_count:4,
    chart_count:types.filter(t=>t.startsWith('Chart.')).length,
    persona_component_count:0,
    image_avatar_count:types.filter(t=>t==='Image').length,
    data_gate:'passed',
    chart_architecture:morning?'horizontal_workdays_horizontal_morning':
      'single_native_stacked_morning_afternoon_bar_per_employee',
    shift_chart_type:morning?'Chart.HorizontalBar':'Chart.HorizontalBar.Stacked',
    afternoon_chart_type:null,
    workday_chart_type:'Chart.HorizontalBar',
    horizontal_label_mode:'indexed_shortest_unique_source_name_suffix',
    full_names_in_workday:true,
    inline_chart_details:morning,
    custom_chart_tooltips:false,
    shift_chart_count:1,
    workday_chart_count:1,
    avatar_directory_count:0,
    native_account_row_count:0,
    profile_panel_count:0,
    daily_compact_row_count:morning?0:source.employees.length,
    selector_count:0,
    exclusive_profile_selection:false,
    avatar_alignment:morning?'inline_chart_label_only':'no_avatar_compact_Entra_details',
    shift_row_values:'exact_source_morning_and_afternoon_durations',
    workday_chart_layout:'single_chart_with_full_name_categories',
    bar_component:'Chart.HorizontalBar',
    legend_scope:'once_per_chart',
    detail_interaction:morning?'source_attendance_in_chart_labels':'one_collapsible_full_day_details',
    detail_buttons:0,
    details_hidden_by_default:true,
    daily_single_stacked_shift_chart:!morning,
    footer_notes:false,
    repeated_legends:false,
    palette:'categoricalBlue_categoricalGreen_good_warning_emphasis',
    shift_legend:morning?'hidden_morning_only':'one_native_legend_for_both_shifts',
    native_microsoft_charts_only:true,
    chart_full_names:'workdays_full_shift_compact_with_index',
    native_charts_visible_per_tab:1,
    compact_kpi_tile_count:4,
    kpi_tile_min_height:'84px',
    kpi_text_alignment:'label_above_value_no_icon_collision',
    kpi_icon_strategy:'semantic_color_dot_no_native_icon',
    row_lock:true,
    chart_scales:workforceScales(source),
    chart_mode_toggle_targets:4,
    chart_point_select_action_supported:false,
    native_microsoft_personas:false,
    avatar_render:'none_no_avatar_misrepresentation',
    graph_avatar_count:0,
    graph_persona_count:0,
    verified_Entra_account_count:morning?0:source.employees.length,
    external_chart_requests:0,
    image_generation:false,
    render_qa:'pending_real_teams_client'
  };
}
