import { createHash } from 'node:crypto';

export const LAYOUT = 'ATTENDANCE_MOBILE_NATIVE_V19_FUTURE_AVATAR_DETAILS';
export const TEST_CHAT = '19:0e02d613cded448892f27d74cff19d63@thread.v2';

const DATA_KEYS = ['target_date','date_label','updated','kpis','total_hours','rate','attention_summary','employees'];
const fail = message => { throw new Error('NATIVE_CARD_GATE: ' + message); };

export const digest = value => createHash('sha256').update(value).digest('hex');
export const sourceDigest = s => digest(JSON.stringify(Object.fromEntries(DATA_KEYS.map(k => [k,s[k]]))));

export function durationMinutes(value) {
  const match = /^(\d+)h([0-5]\d)$/.exec(String(value));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function sessionMinutes(value) {
  if (value === '—') return [];
  return value.split('; ').flatMap(session => {
    const m = /^\d{2}:\d{2}–\d{2}:\d{2} \((\d+h[0-5]\d)\)$/.exec(session);
    if (m) return [durationMinutes(m[1])];
    if (/^\d{2}:\d{2}–—$/.test(session)) return [];
    fail('Unknown session syntax');
  });
}

export function recordedMinutes(e) {
  return [...sessionMinutes(e.morning), ...sessionMinutes(e.afternoon)].reduce((a,b)=>a+b,0);
}

export function shiftTotalMinutes(e,key) {
  return sessionMinutes(e[key]).reduce((a,b)=>a+b,0);
}

export function chartHours(value) {
  return Math.round(Number(value) / 6) / 10;
}

export function workdaysFromMinutes(value) {
  return Math.round((Number(value) / 480) * 100) / 100;
}

export function formatRecordedMinutes(value) {
  const minutes = Number(value);
  return Math.floor(minutes / 60) + 'h' + String(minutes % 60).padStart(2,'0');
}

export function formatWorkdays(value) {
  return workdaysFromMinutes(value).toFixed(2).replace('.',',') + ' công';
}

export function validateDirectory(source,directory) {
  if (!directory || typeof directory!=='object') fail('Employee directory missing');
  for (const e of source.employees) {
    const u=directory[e.name];
    if (!u || typeof u!=='object') fail('Directory user missing: ' + e.name);
    if (!/^[0-9a-f-]{36}$/i.test(String(u.id||''))) fail('Invalid Entra id: ' + e.name);
    if (u.displayName !== e.name) fail('Directory display name mismatch: ' + e.name);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(u.userPrincipalName||''))) {
      fail('Invalid UPN: ' + e.name);
    }
  }
  return directory;
}

export function validateSource(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s?.target_date || '')) fail('Missing report date');
  if (!/^\d{2}:\d{2}$/.test(s.updated || '')) fail('Missing source update time');
  const [yyyy,mm,dd] = s.target_date.split('-');
  if (!String(s.date_label).includes(dd + '/' + mm + '/' + yyyy)) fail('Date label mismatch');
  if (!Array.isArray(s.employees) || s.employees.length !== 8 || s.kpis?.total !== 8) fail('Exactly eight employees required');

  const names=new Set();
  for (const e of s.employees) {
    for (const key of ['name','morning','afternoon','total','status']) {
      if (typeof e[key] !== 'string' || !e[key].trim()) fail('Missing employee ' + key);
    }
    if (names.has(e.name)) fail('Duplicate employee');
    names.add(e.name);
    sessionMinutes(e.morning);
    sessionMinutes(e.afternoon);
    if (!['Đã ghi nhận','Chưa chốt','Cần đối soát','Chưa có bản ghi'].includes(e.status)) fail('Unknown status');
    if (e.total !== 'Chưa chốt' && e.total !== '—' && durationMinutes(e.total) === null) fail('Invalid total');
    if (e.status === 'Đã ghi nhận' && durationMinutes(e.total) === null) fail('Confirmed total missing');
  }

  const closed=s.employees.filter(e=>e.status==='Đã ghi nhận');
  const records=s.employees.filter(e=>e.morning!=='—' || e.afternoon!=='—');
  if (closed.length !== s.kpis.closed) fail('KPI/status mismatch');
  if (records.length !== s.kpis.with_record || s.rate !== String(records.length / 8 * 100) + '%') fail('Record KPI mismatch');
  if (durationMinutes(s.total_hours) !== closed.reduce((n,e)=>n + durationMinutes(e.total),0)) fail('Confirmed hours mismatch');
  return s;
}

const text = (value,options={}) => ({type:'TextBlock',text:value,wrap:true,spacing:'None',...options});
const inline = (value,options={}) => ({type:'TextRun',text:value,...options});
const rich = (inlines,options={}) => ({type:'RichTextBlock',inlines,spacing:'None',...options});
const displayStatus = e => e.status === 'Cần đối soát' ? 'Chưa chốt' : e.status;
const statusColor = e => displayStatus(e)==='Chưa chốt' ? 'Warning'
  : displayStatus(e)==='Đã ghi nhận' ? 'Good' : 'Default';
const rowStyle = e => displayStatus(e)==='Chưa chốt' ? 'warning' : 'default';
const chartFallback = () => text('Thiết bị này chưa hỗ trợ chart native.',{size:'Small',isSubtle:true});

const PALETTE=[
  'categoricalBlue','categoricalTeal','categoricalGreen','categoricalPurple',
  'categoricalMarigold','categoricalLightBlue','categoricalLavender','categoricalLime'
];

const sectionTitle=(iconName,label)=>({
  type:'ColumnSet',
  spacing:'Medium',
  columns:[
    {type:'Column',width:'28px',verticalContentAlignment:'Center',
      items:[{type:'Icon',name:iconName,size:'Small',color:'Accent',fallback:'drop'}]},
    {type:'Column',width:'stretch',verticalContentAlignment:'Center',
      items:[text(label,{size:'Medium',weight:'Bolder'})]}
  ]
});

function personaCompact(e,directory) {
  const u=directory[e.name];
  return {
    type:'Component',
    name:'graph.microsoft.com/users',
    view:'compact',
    properties:{
      users:[{
        id:u.id,
        displayName:u.displayName,
        userPrincipalName:u.userPrincipalName
      }]
    }
  };
}

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
      {legend:'Đã chốt',value:closed,color:'categoricalTeal'},
      {legend:'Chưa chốt',value:open,color:'categoricalPurple'}
    ]}],
    fallback:chartFallback()
  };
}

export function quickSummary(s) {
  const morning=s.employees.flatMap(e=>sessionMinutes(e.morning)).reduce((a,b)=>a+b,0);
  const afternoon=s.employees.flatMap(e=>sessionMinutes(e.afternoon)).reduce((a,b)=>a+b,0);
  return [
    workdaysFromMinutes(morning).toFixed(2).replace('.',','),
    workdaysFromMinutes(afternoon).toFixed(2).replace('.',',')
  ];
}

export function employeeShiftMiniChart(e,i) {
  const morning=shiftTotalMinutes(e,'morning');
  const afternoon=shiftTotalMinutes(e,'afternoon');
  return {
    type:'Chart.HorizontalBar.Stacked',
    id:'shift-chart-' + (i+1),
    title:'\u200B',
    showTitle:false,
    showLegend:false,
    showBarValues:true,
    displayMode:'AbsoluteNoAxis',
    spacing:'None',
    data:[{
      title:'\u200B',
      data:[
        ...(morning>0 ? [{legend:'\u200B',value:chartHours(morning),color:'categoricalPurple'}] : []),
        ...(afternoon>0 ? [{legend:'\u200C',value:chartHours(afternoon),color:'categoricalTeal'}] : [])
      ]
    }],
    fallback:chartFallback()
  };
}

export function employeeWorkdayMiniChart(e,i) {
  return {
    type:'Chart.HorizontalBar',
    id:'workday-chart-' + (i+1),
    title:'',
    showTitle:false,
    showLegend:false,
    showBarValues:true,
    displayMode:'AbsoluteNoAxis',
    spacing:'None',
    data:[{
      x:'',
      y:workdaysFromMinutes(recordedMinutes(e)),
      color:PALETTE[i % PALETTE.length]
    }],
    fallback:chartFallback()
  };
}

function compactShift(value) {
  if (value==='—') return '—';
  return String(value).replace(/ \((\d+h\d{2})\)/g,' · $1');
}

export function employeeDetailPanel(e,i) {
  return {
    type:'Container',
    id:'employee-detail-' + (i+1),
    isVisible:false,
    style:rowStyle(e),
    roundedCorners:true,
    spacing:'Small',
    items:[
      rich([
        inline(String(i+1).padStart(2,'0') + ' · ' + e.name,{size:'Small',weight:'Bolder'}),
        inline('   '),
        inline(
          formatRecordedMinutes(recordedMinutes(e)) + ' · ' +
          formatWorkdays(recordedMinutes(e)) + ' · ' + displayStatus(e),
          {size:'Small',weight:'Bolder',color:statusColor(e)}
        )
      ]),
      rich([
        inline(compactShift(e.morning),{size:'Small',weight:'Bolder',color:'Accent'}),
        inline('    |    ',{size:'Small',isSubtle:true}),
        inline(compactShift(e.afternoon),{size:'Small',weight:'Bolder',color:'Good'})
      ],{spacing:'Small'})
    ]
  };
}

export function avatarChartRow(e,i,directory,mode='shift') {
  const chart = mode==='shift' ? employeeShiftMiniChart(e,i) : employeeWorkdayMiniChart(e,i);
  return {
    type:'Container',
    id:mode + '-row-' + (i+1),
    separator:i>0,
    spacing:'Small',
    items:[
      {
        type:'ColumnSet',
        spacing:'Small',
        columns:[
          {
            type:'Column',
            width:10,
            verticalContentAlignment:'Center',
            items:[personaCompact(e,directory)]
          },
          {
            type:'Column',
            width:90,
            verticalContentAlignment:'Center',
            items:[chart]
          }
        ]
      },
      {
        type:'ActionSet',
        id:'detail-action-' + (i+1),
        spacing:'None',
        horizontalAlignment:'Right',
        actions:[{
          type:'Action.ToggleVisibility',
          title:'Chi tiết',
          targetElements:['employee-detail-' + (i+1)]
        }]
      },
      employeeDetailPanel(e,i)
    ]
  };
}

export function buildNativeCard(source,directory) {
  const s=validateSource(source), k=s.kpis;
  validateDirectory(s,directory);

  const kpis=[
    {label:'Tổng nhân sự',value:k.total,color:'Accent',icon:'People'},
    {label:'Có dữ liệu',value:k.with_record,color:'Good',icon:'DataBarHorizontal'},
    {label:'Đã chốt',value:k.closed,color:'Good',icon:'CheckmarkCircle'},
    {label:'Chưa chốt',value:s.employees.filter(e=>displayStatus(e)!=='Đã ghi nhận').length,color:'Warning',icon:'Clock'}
  ];

  const kpiTile=({label,value,color,icon})=>({
    type:'Column',width:1,items:[{
      type:'Container',style:'default',roundedCorners:true,items:[
        {type:'ColumnSet',spacing:'None',columns:[
          {type:'Column',width:'auto',items:[{type:'Icon',name:icon,size:'Small',color,fallback:'drop'}]},
          {type:'Column',width:'stretch',items:[text(String(value),{
            size:'ExtraLarge',weight:'Bolder',color,horizontalAlignment:'Right'
          })]}
        ]},
        text(label,{size:'Small',weight:'Bolder'})
      ]
    }]
  });

  const [morningWorkdays,afternoonWorkdays]=quickSummary(s);

  return {
    type:'AdaptiveCard',
    $schema:'https://adaptivecards.io/schemas/adaptive-card.json',
    version:'1.5',
    lang:'vi',
    msteams:{width:'Full'},
    body:[
      text('TEST · NATIVE V19 · FUTURE MOBILE',{size:'Small',color:'Accent',weight:'Bolder'}),
      text('BÁO CÁO CHẤM CÔNG — CẢ NGÀY',{size:'Large',weight:'Bolder',spacing:'Small'}),
      text(s.date_label + ' · Cập nhật ' + s.updated,{size:'Small',isSubtle:true,spacing:'Small'}),

      {
        type:'Container',
        id:'overview',
        style:'emphasis',
        roundedCorners:true,
        spacing:'Small',
        items:[
          sectionTitle('Gauge','TỔNG QUAN'),
          overviewStatusChart(s),
          {type:'ColumnSet',spacing:'Small',columns:kpis.slice(0,2).map(kpiTile)},
          {type:'ColumnSet',spacing:'Small',columns:kpis.slice(2).map(kpiTile)},
          rich([
            inline(s.total_hours,{weight:'Bolder',color:'Good'}),
            inline(' giờ xác nhận  ·  '),
            inline(formatWorkdays(durationMinutes(s.total_hours)),{weight:'Bolder',color:'Accent'}),
            inline('  ·  Sáng ' + morningWorkdays + ' công  ·  Chiều ' + afternoonWorkdays + ' công  ·  ' + s.rate,{size:'Small'})
          ],{spacing:'Small'})
        ]
      },

      sectionTitle('DataBarHorizontal','NHÂN SỰ THEO CÔNG / GIỜ'),
      {
        type:'ActionSet',
        id:'chart-view-toggle',
        spacing:'Small',
        actions:[
          {
            type:'Action.ToggleVisibility',
            title:'Theo ca',
            style:'positive',
            targetElements:[
              {elementId:'panel-shifts',isVisible:true},
              {elementId:'panel-workdays',isVisible:false}
            ]
          },
          {
            type:'Action.ToggleVisibility',
            title:'Công quy đổi',
            targetElements:[
              {elementId:'panel-shifts',isVisible:false},
              {elementId:'panel-workdays',isVisible:true}
            ]
          }
        ]
      },
      text('Mỗi dòng chỉ gồm avatar + chart · bấm Chi tiết khi cần xem giờ vào / ra.',{
        size:'Small',isSubtle:true,spacing:'Small'
      }),

      {
        type:'Container',
        id:'panel-shifts',
        isVisible:true,
        spacing:'Small',
        items:s.employees.map((e,i)=>avatarChartRow(e,i,directory,'shift'))
      },

      {
        type:'Container',
        id:'panel-workdays',
        isVisible:false,
        spacing:'Small',
        items:[
          text('CÔNG QUY ĐỔI · 1 công = 8 giờ',{size:'Small',weight:'Bolder',color:'Accent'}),
          {
            type:'Chart.HorizontalBar',
            id:'workforce-workdays-chart',
            title:'',
            showTitle:false,
            showLegend:false,
            showBarValues:true,
            displayMode:'AbsoluteNoAxis',
            spacing:'Small',
            data:s.employees.map((e,i)=>({
              x:String(i+1).padStart(2,'0'),
              y:workdaysFromMinutes(recordedMinutes(e)),
              color:PALETTE[i % PALETTE.length]
            })),
            fallback:chartFallback()
          }
        ]
      },

      {
        type:'Container',
        id:'report-legend',
        style:'emphasis',
        roundedCorners:true,
        spacing:'Medium',
        items:[
          text('GHI CHÚ',{size:'Small',weight:'Bolder',color:'Accent'}),
          rich([
            inline('■ ',{color:'Accent',weight:'Bolder'}),
            inline('Màu tím = ca sáng  ·  ',{size:'Small'}),
            inline('■ ',{color:'Good',weight:'Bolder'}),
            inline('Màu xanh ngọc = ca chiều  ·  ',{size:'Small'}),
            inline('Giá trị trên chart = tổng giờ ghi nhận',{size:'Small',weight:'Bolder'})
          ]),
          text('Chi tiết thời gian hiển thị theo thứ tự ca sáng | ca chiều · 1 công = 8 giờ · Tăng ca được ghi nhận đầy đủ.',{
            size:'Small',isSubtle:true,spacing:'Small'
          })
        ]
      }
    ]
  };
}

export function auditCard(card,source,directory) {
  validateSource(source);
  validateDirectory(source,directory);
  const json=JSON.stringify(card);
  if (Buffer.byteLength(json)>27000) fail('Card payload budget exceeded');

  const ids=new Set(), types=[];
  const walk=v=>{
    if (typeof v==='function' || typeof v==='undefined') fail('Not pure JSON');
    if (!v || typeof v!=='object') return;
    if (v.type) types.push(v.type);
    if (v.type && v.id) {
      if (ids.has(v.id)) fail('Duplicate element id');
      ids.add(v.id);
    }
    if (['Image','TabSet','Accordion','Chart.VerticalBar','Chart.VerticalBar.Grouped'].includes(v.type)) {
      fail('External or nonmobile visual forbidden');
    }
    if ('url' in v || 'backgroundImage' in v) fail('No external resources');
    for (const value of Object.values(v)) walk(value);
  };
  walk(card);

  if (json !== JSON.stringify(buildNativeCard(source,directory))) fail('Layout/data mismatch');

  return {
    layout_version:LAYOUT,
    source_kind:'design_test_fixture',
    target_date:source.target_date,
    source_data_sha256:sourceDigest(source),
    card_sha256:digest(json),
    bytes:Buffer.byteLength(json),
    employee_count:source.employees.length,
    kpi_count:4,
    chart_count:types.filter(t=>t.startsWith('Chart.')).length,
    persona_component_count:types.filter(t=>t==='Component').length,
    data_gate:'passed',
    row_modules:['avatar','microsoft_native_chart'],
    employee_row_module_count:2,
    shift_mini_chart_count:source.employees.length,
    workday_mini_chart_count:0,
    workday_summary_chart_count:1,
    detail_interaction:'per_person_detail_button',
    details_hidden_by_default:true,
    repeated_shift_legends:false,
    chart_category_label:'zero_width',
    future_palette:'purple_teal',
    native_microsoft_charts_only:true,
    native_microsoft_personas:true,
    external_chart_requests:0,
    image_generation:false,
    render_qa:'pending_real_teams_client'
  };
}
