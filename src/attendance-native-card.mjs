import { createHash } from 'node:crypto';

export const LAYOUT = 'ATTENDANCE_MOBILE_NATIVE_V16_PERSONA_BAR_ROWS';
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

  const parts=s.target_date.split('-');
  const yyyy=parts[0], mm=parts[1], dd=parts[2];
  if (!String(s.date_label).includes(dd + '/' + mm + '/' + yyyy)) fail('Date label mismatch');

  if (!Array.isArray(s.employees) || s.employees.length !== 8 || s.kpis?.total !== 8) {
    fail('Exactly eight employees required');
  }

  const names=new Set();
  for (const e of s.employees) {
    for (const key of ['name','morning','afternoon','total','status']) {
      if (typeof e[key] !== 'string' || !e[key].trim()) fail('Missing employee ' + key);
    }
    if (names.has(e.name)) fail('Duplicate employee');
    names.add(e.name);

    sessionMinutes(e.morning);
    sessionMinutes(e.afternoon);

    if (!['Đã ghi nhận','Chưa chốt','Cần đối soát','Chưa có bản ghi'].includes(e.status)) {
      fail('Unknown status');
    }
    if (e.total !== 'Chưa chốt' && e.total !== '—' && durationMinutes(e.total) === null) {
      fail('Invalid total');
    }
    if (e.status === 'Đã ghi nhận' && durationMinutes(e.total) === null) {
      fail('Confirmed total missing');
    }
  }

  const closed=s.employees.filter(e=>e.status==='Đã ghi nhận');
  const records=s.employees.filter(e=>e.morning!=='—' || e.afternoon!=='—');

  if (closed.length !== s.kpis.closed) fail('KPI/status mismatch');
  if (records.length !== s.kpis.with_record || s.rate !== String(records.length / 8 * 100) + '%') {
    fail('Record KPI mismatch');
  }
  if (durationMinutes(s.total_hours) !== closed.reduce((n,e)=>n + durationMinutes(e.total),0)) {
    fail('Confirmed hours mismatch');
  }

  return s;
}

const text = (value,options={}) => ({type:'TextBlock',text:value,wrap:true,spacing:'None',...options});
const inline = (value,options={}) => ({type:'TextRun',text:value,...options});
const rich = (inlines,options={}) => ({type:'RichTextBlock',inlines,spacing:'None',...options});
const displayStatus = e => e.status === 'Cần đối soát' ? 'Chưa chốt' : e.status;
const statusColor = e => displayStatus(e) === 'Chưa chốt' ? 'Warning'
  : displayStatus(e) === 'Đã ghi nhận' ? 'Good' : 'Default';
const rowStyle = e => displayStatus(e) === 'Chưa chốt' ? 'warning' : 'default';
const chartFallback = () => text('Thiết bị này chưa hỗ trợ chart native; xem chi tiết giờ phía dưới.',
  {size:'Small',isSubtle:true});

const PALETTE=[
  'categoricalBlue','categoricalTeal','categoricalGreen','categoricalPurple',
  'categoricalMarigold','categoricalLightBlue','categoricalLavender','categoricalLime'
];

const sectionTitle=(iconName,label)=>({
  type:'ColumnSet',
  spacing:'Medium',
  columns:[
    {
      type:'Column',
      width:'28px',
      verticalContentAlignment:'Center',
      items:[{type:'Icon',name:iconName,size:'Small',color:'Accent',fallback:'drop'}]
    },
    {
      type:'Column',
      width:'stretch',
      verticalContentAlignment:'Center',
      items:[text(label,{size:'Medium',weight:'Bolder'})]
    }
  ]
});

export function chartName(name) {
  const parts=String(name).trim().split(/\s+/);
  return parts.length<=2 ? name : parts.slice(-2).join(' ');
}

export function nativeShiftChart(s) {
  return {
    type:'Chart.HorizontalBar.Stacked',
    id:'workforce-shifts-chart',
    title:'Giờ theo ca',
    showTitle:false,
    showLegend:true,
    showBarValues:true,
    xAxisTitle:'Giờ',
    spacing:'Small',
    data:s.employees.map((e,i)=>{
      const morning=shiftTotalMinutes(e,'morning');
      const afternoon=shiftTotalMinutes(e,'afternoon');
      return {
        title:String(i+1).padStart(2,'0') + ' · ' + chartName(e.name),
        data:[
          ...(morning>0 ? [{
            legend:'Ca sáng',
            value:chartHours(morning),
            color:'categoricalBlue'
          }] : []),
          ...(afternoon>0 ? [{
            legend:'Ca chiều',
            value:chartHours(afternoon),
            color:'categoricalTeal'
          }] : [])
        ]
      };
    }),
    fallback:chartFallback()
  };
}

export function workdayChart(s) {
  return {
    type:'Chart.HorizontalBar',
    id:'workforce-workdays-chart',
    title:'Công quy đổi theo nhân sự',
    showTitle:false,
    showLegend:false,
    showBarValues:true,
    displayMode:'AbsoluteNoAxis',
    spacing:'Small',
    data:s.employees.map((e,i)=>({
      x:String(i+1).padStart(2,'0') + ' · ' + chartName(e.name),
      y:workdaysFromMinutes(recordedMinutes(e)),
      color:PALETTE[i % PALETTE.length]
    })),
    fallback:chartFallback()
  };
}

export function aggregateShiftMixChart(s) {
  const morning=s.employees.flatMap(e=>sessionMinutes(e.morning)).reduce((a,b)=>a+b,0);
  const afternoon=s.employees.flatMap(e=>sessionMinutes(e.afternoon)).reduce((a,b)=>a+b,0);

  return {
    type:'Chart.HorizontalBar.Stacked',
    id:'shift-mix',
    title:'Phân bổ công theo ca',
    showTitle:false,
    showLegend:true,
    showBarValues:true,
    spacing:'Small',
    data:[{
      title:'Công quy đổi',
      data:[
        {legend:'Ca sáng',value:workdaysFromMinutes(morning),color:'categoricalBlue'},
        {legend:'Ca chiều',value:workdaysFromMinutes(afternoon),color:'categoricalTeal'}
      ]
    }],
    fallback:chartFallback()
  };
}

export function statusStrip(s) {
  const data=[
    {
      legend:'Đã ghi nhận',
      color:'categoricalBlue',
      value:s.employees.filter(e=>displayStatus(e)==='Đã ghi nhận').length
    },
    {
      legend:'Chưa chốt',
      color:'categoricalMarigold',
      value:s.employees.filter(e=>displayStatus(e)!=='Đã ghi nhận').length
    }
  ].filter(p=>p.value>0);

  return {
    type:'Chart.HorizontalBar.Stacked',
    id:'status-strip',
    title:'Cơ cấu trạng thái',
    showTitle:false,
    showLegend:true,
    showBarValues:true,
    spacing:'Small',
    data:[{title:'Trạng thái',data}],
    fallback:chartFallback()
  };
}

export function shiftDonut(s) {
  const morning=s.employees.flatMap(e=>sessionMinutes(e.morning)).reduce((a,b)=>a+b,0);
  const afternoon=s.employees.flatMap(e=>sessionMinutes(e.afternoon)).reduce((a,b)=>a+b,0);
  const morningWorkdays=workdaysFromMinutes(morning);
  const afternoonWorkdays=workdaysFromMinutes(afternoon);
  return {
    type:'Chart.Donut',
    colorSet:'categorical',
    showLegend:true,
    spacing:'Small',
    data:[
      {legend:'Ca sáng · ' + morningWorkdays.toFixed(2).replace('.',',') + ' công',value:morningWorkdays},
      {legend:'Ca chiều · ' + afternoonWorkdays.toFixed(2).replace('.',',') + ' công',value:afternoonWorkdays}
    ],
    fallback:chartFallback()
  };
}

export function statusDonut(s) {
  const closed=s.employees.filter(e=>displayStatus(e)==='Đã ghi nhận').length;
  const open=s.employees.length-closed;
  return {
    type:'Chart.Donut',
    colorSet:'categorical',
    showLegend:true,
    spacing:'Small',
    data:[
      {legend:'Đã ghi nhận · ' + closed,value:closed},
      {legend:'Chưa chốt · ' + open,value:open}
    ],
    fallback:chartFallback()
  };
}

export function quickSummary(s) {
  const morning=s.employees.flatMap(e=>sessionMinutes(e.morning)).reduce((a,b)=>a+b,0);
  const afternoon=s.employees.flatMap(e=>sessionMinutes(e.afternoon)).reduce((a,b)=>a+b,0);
  const closed=s.employees.filter(e=>displayStatus(e)==='Đã ghi nhận').length;
  return [
    {label:'Ca sáng',value:workdaysFromMinutes(morning).toFixed(2).replace('.',','),unit:'công',color:'Accent'},
    {label:'Ca chiều',value:workdaysFromMinutes(afternoon).toFixed(2).replace('.',','),unit:'công',color:'Good'},
    {label:'Đã chốt',value:closed + '/' + s.employees.length,unit:(s.employees.length-closed) + ' chưa chốt',color:'Good'}
  ];
}

function personaForEmployee(e,directory) {
  const u=directory[e.name];
  return {
    type:'Component',
    name:'graph.microsoft.com/user',
    view:'compact',
    properties:{
      id:u.id,
      displayName:u.displayName
    }
  };
}

export function personaSet(source,directory) {
  return {
    type:'Component',
    name:'graph.microsoft.com/users',
    view:'compact',
    properties:{
      users:source.employees.map(e=>{
        const u=directory[e.name];
        return {
          id:u.id,
          displayName:u.displayName,
          userPrincipalName:u.userPrincipalName
        };
      })
    },
    fallback:text(source.employees.map(e=>e.name).join(' · '),{size:'Small',isSubtle:true})
  };
}

function totalSummary(e) {
  return formatRecordedMinutes(recordedMinutes(e)) + ' · ' +
    formatWorkdays(recordedMinutes(e)) + ' · ' + displayStatus(e);
}

const tableCell=(items,style='default')=>({
  type:'TableCell',
  style,
  verticalContentAlignment:'Center',
  items
});


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
    data:[{
      title:'Nhân sự',
      data:[
        {legend:'Đã chốt',value:closed,color:'categoricalBlue'},
        {legend:'Chưa chốt',value:open,color:'categoricalMarigold'}
      ]
    }],
    fallback:chartFallback()
  };
}

function personaCompact(e,directory) {
  const u=directory[e.name];
  return {
    type:'Component',
    name:'graph.microsoft.com/user',
    view:'compact',
    properties:{
      id:u.id,
      displayName:u.displayName,
      userPrincipalName:u.userPrincipalName
    },
    fallback:text(e.name,{size:'Small',weight:'Bolder'})
  };
}

function weightedBar(morning,afternoon,totalScale=720) {
  const used=Math.max(0,morning)+Math.max(0,afternoon);
  const rest=Math.max(1,totalScale-used);
  const columns=[];

  if (morning>0) columns.push({
    type:'Column',
    width:morning,
    style:'accent',
    minHeight:'20px',
    items:[]
  });

  if (afternoon>0) columns.push({
    type:'Column',
    width:afternoon,
    style:'good',
    minHeight:'20px',
    items:[]
  });

  columns.push({
    type:'Column',
    width:rest,
    style:'emphasis',
    minHeight:'20px',
    items:[]
  });

  return {type:'ColumnSet',spacing:'None',columns};
}

function workdayBar(minutes,totalScale=720,status='Đã ghi nhận') {
  const used=Math.max(0,minutes);
  const rest=Math.max(1,totalScale-used);
  const barStyle=status==='Đã ghi nhận' ? 'accent' : 'warning';
  return {
    type:'ColumnSet',
    spacing:'None',
    columns:[
      {
        type:'Column',
        width:used || 1,
        items:[{
          type:'Container',
          style:barStyle,
          roundedCorners:true,
          minHeight:'22px',
          items:[]
        }]
      },
      {
        type:'Column',
        width:rest,
        items:[{
          type:'Container',
          style:'emphasis',
          roundedCorners:true,
          minHeight:'22px',
          items:[]
        }]
      }
    ]
  };
}

export function personaShiftRow(e,i,directory) {
  const morning=shiftTotalMinutes(e,'morning');
  const afternoon=shiftTotalMinutes(e,'afternoon');
  return {
    type:'ColumnSet',
    id:'shift-row-' + (i+1),
    separator:i>0,
    spacing:'Small',
    columns:[
      {
        type:'Column',
        width:36,
        verticalContentAlignment:'Center',
        items:[personaCompact(e,directory)]
      },
      {
        type:'Column',
        width:50,
        verticalContentAlignment:'Center',
        items:[weightedBar(morning,afternoon)]
      },
      {
        type:'Column',
        width:14,
        verticalContentAlignment:'Center',
        items:[text(formatRecordedMinutes(recordedMinutes(e)),{
          size:'Small',
          weight:'Bolder',
          horizontalAlignment:'Right',
          color:statusColor(e)
        })]
      }
    ]
  };
}

export function personaWorkdayRow(e,i,directory) {
  return {
    type:'Container',
    id:'workday-row-' + (i+1),
    separator:i>0,
    spacing:'Small',
    items:[{
      type:'ColumnSet',
      spacing:'Small',
      columns:[
        {
          type:'Column',
          width:36,
          verticalContentAlignment:'Center',
          items:[personaCompact(e,directory)]
        },
        {
          type:'Column',
          width:50,
          verticalContentAlignment:'Center',
          items:[workdayBar(recordedMinutes(e),720,displayStatus(e))]
        },
        {
          type:'Column',
          width:14,
          verticalContentAlignment:'Center',
          items:[text(formatWorkdays(recordedMinutes(e)),{
            size:'Small',
            weight:'Bolder',
            horizontalAlignment:'Right',
            color:statusColor(e)
          })]
        }
      ]
    }]
  };
}

export function compactDetailsTable(s,directory) {
  return {
    type:'Table',
    id:'details-table-compact',
    firstRowAsHeader:true,
    showGridLines:false,
    columns:[{width:34},{width:66}],
    rows:[
      {
        type:'TableRow',
        cells:[
          tableCell([text('NHÂN SỰ',{size:'Small',weight:'Bolder',color:'Accent'})],'emphasis'),
          tableCell([text('GIỜ VÀO / RA · TỔNG',{size:'Small',weight:'Bolder',color:'Accent'})],'emphasis')
        ]
      },
      ...s.employees.map((e,i)=>({
        type:'TableRow',
        cells:[
          tableCell([
            text(String(i+1).padStart(2,'0') + ' · ' + e.name,{size:'Small',weight:'Bolder'})
          ],rowStyle(e)),
          tableCell([
            rich([
              inline('S ',{weight:'Bolder',color:'Accent',size:'Small'}),
              inline(e.morning,{size:'Small'}),
              inline('  ·  C ',{weight:'Bolder',color:'Good',size:'Small'}),
              inline(e.afternoon,{size:'Small'})
            ]),
            text(totalSummary(e),{
              size:'Small',
              weight:'Bolder',
              color:statusColor(e),
              spacing:'Small'
            })
          ],rowStyle(e))
        ]
      }))
    ]
  };
}


export function compactDetailLines(s) {
  return s.employees.map((e,i)=>text(
    '**' + String(i+1).padStart(2,'0') + ' · ' + e.name + '**  ·  S ' + e.morning +
    '  ·  C ' + e.afternoon + '  ·  ' + totalSummary(e),
    {
      id:'detail-line-' + (i+1),
      size:'Small',
      separator:i>0,
      spacing:'Small',
      color:statusColor(e)
    }
  ));
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
    type:'Column',
    width:1,
    items:[{
      type:'Container',
      style:'default',
      roundedCorners:true,
      items:[
        {
          type:'ColumnSet',
          spacing:'None',
          columns:[
            {type:'Column',width:'auto',items:[{type:'Icon',name:icon,size:'Small',color,fallback:'drop'}]},
            {type:'Column',width:'stretch',items:[text(String(value),{
              size:'ExtraLarge',weight:'Bolder',color,horizontalAlignment:'Right'
            })]}
          ]
        },
        text(label,{size:'Small',weight:'Bolder'})
      ]
    }]
  });

  return {
    type:'AdaptiveCard',
    $schema:'https://adaptivecards.io/schemas/adaptive-card.json',
    version:'1.5',
    lang:'vi',
    msteams:{width:'Full'},
    body:[
      text('TEST · NATIVE V16 · PERSONA BAR ROWS',{size:'Small',color:'Accent',weight:'Bolder'}),
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
            inline('  ·  Sáng ' + quickSummary(s)[0].value + ' công  ·  Chiều ' + quickSummary(s)[1].value + ' công  ·  ' + s.rate,{size:'Small'})
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

      {
        type:'Container',
        id:'panel-shifts',
        isVisible:true,
        spacing:'Small',
        items:[
          rich([
            inline('■ ',{color:'Accent',weight:'Bolder'}), inline('Sáng',{size:'Small',weight:'Bolder'}),
            inline('   ■ ',{color:'Good',weight:'Bolder'}), inline('Chiều',{size:'Small',weight:'Bolder'}),
            inline('   · Tổng giờ',{size:'Small',isSubtle:true})
          ]),
          ...s.employees.map((e,i)=>personaShiftRow(e,i,directory))
        ]
      },

      {
        type:'Container',
        id:'panel-workdays',
        isVisible:false,
        spacing:'Small',
        items:[
          text('CÔNG QUY ĐỔI · 1 công = 8 giờ',{size:'Small',weight:'Bolder',color:'Accent'}),
          workdayChart(s)
        ]
      },

      sectionTitle('Clock','CHI TIẾT GIỜ VÀO / RA'),
      {
        type:'ActionSet',
        id:'details-toggle',
        spacing:'Small',
        actions:[{
          type:'Action.ToggleVisibility',
          title:'Xem / Ẩn chi tiết (8)',
          targetElements:['attendance-details-panel']
        }]
      },
      {
        type:'Container',
        id:'attendance-details-panel',
        isVisible:false,
        spacing:'Small',
        items:compactDetailLines(s)
      },

      text('1 công = 8 giờ · Tăng ca được ghi nhận đầy đủ theo dữ liệu thực tế · Sai lệch vui lòng phản hồi P.HC-NS.',
        {size:'Small',isSubtle:true,spacing:'Small'})
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
    table_count:types.filter(t=>t==='Table').length,
    chart_count:types.filter(t=>t.startsWith('Chart.')).length,
    persona_bar_row_count:source.employees.length,
    donut_count:types.filter(t=>t==='Chart.Donut').length,
    persona_component_count:types.filter(t=>t==='Component').length,
    data_gate:'passed',
    chart_units:['stacked_shift_hours','workdays'],
    workday_conversion_minutes:480,
    dual_chart_view:true,
    shift_chart_stacked:true,
    native_microsoft_charts_only:true,
    native_microsoft_personas:true,
    quick_summary_mode:'merged_overview',
    personas_in_chart_section:true,
    row_based_persona_bars:true,
    collapsible_detail_panel:true,
    mobile_detail_rows:source.employees.length,
    external_chart_requests:0,
    image_generation:false,
    render_qa:'pending_designer_and_real_teams_clients'
  };
}
