import { createHash } from 'node:crypto';

export const LAYOUT = 'ATTENDANCE_MOBILE_HYBRID_V12_STACKED_SHIFTS';
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

export function validateSource(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s?.target_date || '')) fail('Missing report date');
  if (!/^\d{2}:\d{2}$/.test(s.updated || '')) fail('Missing source update time');

  const [yyyy,mm,dd] = s.target_date.split('-');
  if (!String(s.date_label).includes(dd + '/' + mm + '/' + yyyy)) fail('Date label mismatch');

  if (!Array.isArray(s.employees) || s.employees.length !== 8 || s.kpis?.total !== 8) {
    fail('Exactly eight employees required');
  }

  const names = new Set();
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

  const closed = s.employees.filter(e => e.status === 'Đã ghi nhận');
  const records = s.employees.filter(e => e.morning !== '—' || e.afternoon !== '—');

  if (closed.length !== s.kpis.closed) fail('KPI/status mismatch');
  if (records.length !== s.kpis.with_record || s.rate !== String(records.length / 8 * 100) + '%') {
    fail('Record KPI mismatch');
  }
  if (durationMinutes(s.total_hours) !== closed.reduce((n,e)=>n + durationMinutes(e.total),0)) {
    fail('Confirmed hours mismatch');
  }

  return s;
}

const text = (value, options={}) => ({type:'TextBlock',text:value,wrap:true,spacing:'None',...options});
const inline = (value, options={}) => ({type:'TextRun',text:value,...options});
const rich = (inlines, options={}) => ({type:'RichTextBlock',inlines,spacing:'None',...options});
const displayStatus = e => e.status === 'Cần đối soát' ? 'Chưa chốt' : e.status;
const statusColor = e => displayStatus(e) === 'Chưa chốt' ? 'Warning'
  : displayStatus(e) === 'Đã ghi nhận' ? 'Good' : 'Default';
const rowStyle = e => displayStatus(e) === 'Chưa chốt' ? 'warning' : 'default';
const chartFallback = () => text('Biểu đồ chưa được hỗ trợ; dữ liệu chi tiết vẫn có bên dưới.',
  {size:'Small',isSubtle:true});

const PALETTE = [
  'categoricalBlue',
  'categoricalTeal',
  'categoricalGreen',
  'categoricalPurple',
  'categoricalMarigold',
  'categoricalLightBlue',
  'categoricalLavender',
  'categoricalLime'
];

const sectionTitle = (iconName, label) => ({
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
  const parts = String(name).trim().split(/\s+/);
  return parts.length <= 2 ? name : parts.slice(-2).join(' ');
}

function shiftTotalMinutes(e, key) {
  return sessionMinutes(e[key]).reduce((a,b)=>a+b,0);
}

export function shiftChartCreatePayload(source) {
  const s=validateSource(source);
  const names=s.employees.map((e,i)=>String(i+1).padStart(2,'0') + ' · ' + chartName(e.name));
  const morningMinutes=s.employees.map(e=>shiftTotalMinutes(e,'morning'));
  const afternoonMinutes=s.employees.map(e=>shiftTotalMinutes(e,'afternoon'));
  const morning=morningMinutes.map(chartHours);
  const afternoon=afternoonMinutes.map(chartHours);
  const morningLabels=morningMinutes.map(v=>v ? 'S ' + formatRecordedMinutes(v) : '');
  const afternoonLabels=afternoonMinutes.map(v=>v ? 'C ' + formatRecordedMinutes(v) : '');

  const chart = String.raw`{
    type:'bar',
    data:{
      labels:${JSON.stringify(names)},
      datasets:[
        {
          label:'Ca sáng',
          data:${JSON.stringify(morning)},
          _labels:${JSON.stringify(morningLabels)},
          _names:${JSON.stringify(names)},
          backgroundColor:'#4F46E5',
          borderColor:'#4338CA',
          borderWidth:1,
          borderRadius:10,
          borderSkipped:false,
          barThickness:58
        },
        {
          label:'Ca chiều',
          data:${JSON.stringify(afternoon)},
          _labels:${JSON.stringify(afternoonLabels)},
          _names:${JSON.stringify(names)},
          backgroundColor:'#14B8A6',
          borderColor:'#0F766E',
          borderWidth:1,
          borderRadius:10,
          borderSkipped:false,
          barThickness:58
        }
      ]
    },
    options:{
      indexAxis:'y',
      responsive:false,
      animation:false,
      layout:{padding:{top:6,right:10,bottom:6,left:10}},
      scales:{
        x:{
          stacked:true,
          beginAtZero:true,
          grid:{display:false},
          border:{display:false},
          ticks:{display:false}
        },
        y:{
          stacked:true,
          grid:{display:false},
          border:{display:false},
          ticks:{display:false}
        }
      },
      plugins:{
        legend:{
          display:true,
          position:'top',
          align:'start',
          labels:{
            boxWidth:18,
            boxHeight:18,
            font:{size:18,weight:'600'},
            padding:18
          }
        },
        datalabels:{
          labels:{
            name:{
              display:function(ctx){
                var i=ctx.dataIndex;
                var morningValue=ctx.chart.data.datasets[0].data[i] || 0;
                return (ctx.datasetIndex===0 && morningValue>0) ||
                  (ctx.datasetIndex===1 && morningValue===0 && ctx.dataset.data[i]>0);
              },
              formatter:function(value,ctx){
                var i=ctx.dataIndex;
                var shiftLabel=ctx.dataset._labels[i] || '';
                return [ctx.dataset._names[i],shiftLabel];
              },
              color:'#ffffff',
              anchor:'start',
              align:'right',
              offset:8,
              clamp:true,
              font:{size:16,weight:'700'},
              textAlign:'left',
              textStrokeColor:'rgba(0,0,0,0.18)',
              textStrokeWidth:2
            },
            shift:{
              display:function(ctx){
                var i=ctx.dataIndex;
                if(!ctx.dataset.data[i]) return false;
                var morningValue=ctx.chart.data.datasets[0].data[i] || 0;
                if(ctx.datasetIndex===0 && morningValue>0) return false;
                if(ctx.datasetIndex===1 && morningValue===0) return false;
                return true;
              },
              formatter:function(value,ctx){
                return ctx.dataset._labels[ctx.dataIndex] || '';
              },
              color:'#ffffff',
              anchor:'center',
              align:'center',
              clamp:true,
              font:{size:17,weight:'700'},
              textStrokeColor:'rgba(0,0,0,0.16)',
              textStrokeWidth:2
            }
          }
        },
        tooltip:{enabled:false}
      }
    }
  }`;

  return {
    version:'4',
    width:1100,
    height:760,
    devicePixelRatio:2,
    backgroundColor:'#ffffff',
    format:'png',
    chart
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

export function hoursChart(s) {
  return {
    type:'Chart.HorizontalBar',
    id:'workforce-hours-chart',
    title:'Giờ thực tế theo nhân sự',
    showTitle:false,
    showLegend:false,
    showBarValues:true,
    displayMode:'AbsoluteNoAxis',
    spacing:'Small',
    data:s.employees.map((e,i)=>({
      x:String(i+1).padStart(2,'0') + ' · ' + chartName(e.name),
      y:chartHours(recordedMinutes(e)),
      color:PALETTE[i % PALETTE.length]
    })),
    fallback:chartFallback()
  };
}

export function aggregateShiftMixChart(s) {
  const morning = s.employees.flatMap(e=>sessionMinutes(e.morning)).reduce((a,b)=>a+b,0);
  const afternoon = s.employees.flatMap(e=>sessionMinutes(e.afternoon)).reduce((a,b)=>a+b,0);

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
  const data = [
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

function totalSummary(e) {
  return formatRecordedMinutes(recordedMinutes(e)) + ' · ' + formatWorkdays(recordedMinutes(e)) + ' · ' + displayStatus(e);
}

const tableCell = (items, style='default') => ({
  type:'TableCell',
  style,
  verticalContentAlignment:'Center',
  items
});

export function compactDetailsTable(s) {
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

export function buildNativeCard(source, shiftChartUrl) {
  const s=validateSource(source), k=s.kpis;
  const kpis=[
    ['Tổng nhân sự',k.total,'Accent'],
    ['Có dữ liệu',k.with_record,'Good'],
    ['Đã chốt',k.closed,'Good'],
    ['Chưa chốt',s.employees.filter(e=>displayStatus(e)!=='Đã ghi nhận').length,'Warning']
  ];

  const kpiColumns = entries => ({
    type:'ColumnSet',
    spacing:'None',
    columns:entries.map(([label,value,color])=>({
      type:'Column',
      width:1,
      spacing:'Small',
      items:[
        text(String(value),{size:'ExtraLarge',weight:'Bolder',color,horizontalAlignment:'Center'}),
        text(label,{size:'Small',horizontalAlignment:'Center'})
      ]
    }))
  });

  return {
    type:'AdaptiveCard',
    $schema:'https://adaptivecards.io/schemas/adaptive-card.json',
    version:'1.5',
    lang:'vi',
    msteams:{width:'Full'},
    body:[
      text('TEST · HYBRID V12 · MOBILE FIRST',{size:'Small',color:'Accent',weight:'Bolder'}),
      text('BÁO CÁO CHẤM CÔNG — CẢ NGÀY',{size:'Large',weight:'Bolder',spacing:'Small'}),
      text(s.date_label + ' · Cập nhật ' + s.updated,{size:'Small',isSubtle:true,spacing:'Small'}),

      {
        type:'Container',
        id:'kpi-mobile',
        targetWidth:'atMost:Narrow',
        style:'emphasis',
        roundedCorners:true,
        spacing:'Small',
        items:[
          kpiColumns(kpis.slice(0,2)),
          {...kpiColumns(kpis.slice(2)),spacing:'Small'}
        ]
      },
      {
        type:'Container',
        id:'kpi-wide',
        targetWidth:'atLeast:Standard',
        style:'emphasis',
        roundedCorners:true,
        spacing:'Small',
        items:[kpiColumns(kpis)]
      },

      {
        type:'Container',
        style:'default',
        roundedCorners:true,
        spacing:'Small',
        items:[
          rich([
            inline('Xác nhận  ',{size:'Small'}),
            inline(s.total_hours,{weight:'Bolder',size:'Large',color:'Good'}),
            inline('  ·  ',{size:'Small'}),
            inline(formatWorkdays(durationMinutes(s.total_hours)),{weight:'Bolder',size:'Medium',color:'Accent'})
          ]),
          rich([
            inline('Có bản ghi  ',{size:'Small'}),
            inline(s.rate,{weight:'Bolder',size:'Medium'}),
            inline('  ·  1 công = 8 giờ',{size:'Small',isSubtle:true})
          ],{spacing:'Small'})
        ]
      },

      sectionTitle('DataBarHorizontal','THEO DÕI CÔNG / GIỜ'),
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
          text('GIỜ THEO CA · CÙNG MỘT THANH',{size:'Small',weight:'Bolder',color:'Accent'}),
          text('Tên nhân sự chồng trực tiếp trên bar · Sáng và Chiều ghép trên cùng một thanh.',{size:'Small',isSubtle:true,spacing:'Small'}),
          {
            type:'Image',
            id:'shift-overlay-chart',
            url:shiftChartUrl,
            size:'Stretch',
            altText:'Biểu đồ giờ ca sáng và ca chiều theo nhân sự'
          }
        ]
      },
      {
        type:'Container',
        id:'panel-workdays',
        isVisible:false,
        spacing:'Small',
        items:[
          text('CÔNG QUY ĐỔI THEO NHÂN SỰ',{size:'Small',weight:'Bolder',color:'Accent'}),
          text('1 công = 8 giờ · giá trị hiển thị trực tiếp ở cuối thanh.',{size:'Small',isSubtle:true,spacing:'Small'}),
          workdayChart(s)
        ]
      },

      sectionTitle('DataTrending','CHỈ SỐ NHANH'),
      text('Phân bổ công ghi nhận theo ca',{size:'Small',weight:'Bolder'}),
      aggregateShiftMixChart(s),
      text('Tình trạng chấm công',{size:'Small',weight:'Bolder',spacing:'Small'}),
      statusStrip(s),

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
        items:[
          compactDetailsTable(s)
        ]
      },

      text('Quy đổi tham khảo: 1 công = 8 giờ. Thời gian tăng ca được ghi nhận đầy đủ theo dữ liệu thực tế. Sai lệch vui lòng phản hồi P.HC-NS.',
        {size:'Small',isSubtle:true,spacing:'Small'})
    ]
  };
}

export function auditCard(card, source, shiftChartUrl) {
  validateSource(source);
  const json=JSON.stringify(card);

  if (Buffer.byteLength(json)>27000) fail('Card payload budget exceeded');

  const ids=new Set(), types=[];
  const walk=v=>{
    if (typeof v==='function' || typeof v==='undefined') fail('Not pure JSON');
    if (!v || typeof v!=='object') return;

    if (v.type) types.push(v.type);
    if (v.id) {
      if (ids.has(v.id)) fail('Duplicate element id');
      ids.add(v.id);
    }

    if (['TabSet','Accordion','Chart.VerticalBar','Chart.VerticalBar.Grouped'].includes(v.type)) {
      fail('Nonmobile visual forbidden');
    }
    if (v.type==='Image') {
      if (typeof v.url!=='string' || !/^https:\/\/quickchart\.io\/chart\/render\/[A-Za-z0-9_-]+/.test(v.url)) {
        fail('Only QuickChart render images are allowed');
      }
    } else if ('url' in v || 'backgroundImage' in v) {
      fail('Unexpected external resource');
    }

    for (const value of Object.values(v)) walk(value);
  };
  walk(card);

  if (json !== JSON.stringify(buildNativeCard(source, shiftChartUrl))) fail('Layout/data mismatch');

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
    data_gate:'passed',
    chart_units:['stacked_shift_hours','workdays'],
    workday_conversion_minutes:480,
    dual_chart_view:true,
    shift_chart_name_overlay:true,
    shift_chart_stacked:true,
    collapsible_detail_panel:true,
    mobile_detail_rows:source.employees.length,
    external_chart_requests:1,
    external_chart_provider:'quickchart.io',
    image_generation:false,
    render_qa:'pending_designer_and_real_teams_clients'
  };
}
