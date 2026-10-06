import { createHash } from 'node:crypto';

export const LAYOUT = 'ATTENDANCE_MOBILE_NATIVE_V8_COLLAPSIBLE_DETAILS';
export const TEST_CHAT = '19:0e02d613cded448892f27d74cff19d63@thread.v2';
const DATA_KEYS = ['target_date', 'date_label', 'updated', 'kpis', 'total_hours', 'rate', 'attention_summary', 'employees'];
const fail = message => { throw new Error('NATIVE_CARD_GATE: ' + message); };
export const digest = value => createHash('sha256').update(value).digest('hex');
export const sourceDigest = s => digest(JSON.stringify(Object.fromEntries(DATA_KEYS.map(k => [k, s[k]]))));

export function durationMinutes(value) {
  const match = /^(\d+)h([0-5]\d)$/.exec(String(value));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
export function hoursFromMinutes(value) {
  return Number((Number(value) / 60).toFixed(2));
}
export function chartHours(value) {
  return Math.round(Number(value) / 6) / 10;
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
export function validateSource(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s?.target_date || '')) fail('Missing report date');
  if (!/^\d{2}:\d{2}$/.test(s.updated || '')) fail('Missing source update time');
  const [yyyy, mm, dd] = s.target_date.split('-');
  if (!String(s.date_label).includes(dd + '/' + mm + '/' + yyyy)) fail('Date label mismatch');
  if (!Array.isArray(s.employees) || s.employees.length !== 8 || s.kpis?.total !== 8) fail('Exactly eight employees required');
  const names = new Set();
  for (const e of s.employees) {
    for (const key of ['name', 'morning', 'afternoon', 'total', 'status']) {
      if (typeof e[key] !== 'string' || !e[key].trim()) fail('Missing employee ' + key);
    }
    if (names.has(e.name)) fail('Duplicate employee');
    names.add(e.name);
    sessionMinutes(e.morning);
    sessionMinutes(e.afternoon);
    if (!['Đã ghi nhận', 'Chưa chốt', 'Cần đối soát', 'Chưa có bản ghi'].includes(e.status)) fail('Unknown status');
    if (e.total !== 'Chưa chốt' && e.total !== '—' && durationMinutes(e.total) === null) fail('Invalid total');
    if (e.status === 'Đã ghi nhận' && durationMinutes(e.total) === null) fail('Confirmed total missing');
    if (e.attention !== (e.status !== 'Đã ghi nhận')) fail('Attention flag mismatch');
  }
  const closed = s.employees.filter(e => e.status === 'Đã ghi nhận');
  const records = s.employees.filter(e => e.morning !== '—' || e.afternoon !== '—');
  if (closed.length !== s.kpis.closed || 8 - closed.length !== s.kpis.attention) fail('KPI/status mismatch');
  if (records.length !== s.kpis.with_record || s.rate !== String(records.length / 8 * 100) + '%') fail('Record KPI mismatch');
  if (durationMinutes(s.total_hours) !== closed.reduce((n, e) => n + durationMinutes(e.total), 0)) fail('Confirmed hours mismatch');
  const attention = s.employees.filter(e => e.attention).map(e => e.name + ' — ' + e.status).join(' · ');
  if (attention !== s.attention_summary) fail('Attention summary mismatch');
  return s;
}

const text = (value, options = {}) => ({type:'TextBlock', text:value, wrap:true, spacing:'None', ...options});
const inline = (value, options = {}) => ({type:'TextRun', text:value, ...options});
const rich = (inlines, options = {}) => ({type:'RichTextBlock', inlines, spacing:'None', ...options});
const statusColor = e => e.status === 'Cần đối soát' ? 'Attention'
  : e.status === 'Chưa chốt' ? 'Warning' : e.status === 'Đã ghi nhận' ? 'Good' : 'Default';
const rowStyle = e => e.status === 'Cần đối soát' ? 'attention'
  : e.status === 'Chưa chốt' ? 'warning' : 'default';
const chartFallback = () => text('Biểu đồ chưa được hỗ trợ; giờ vào/ra vẫn hiển thị đầy đủ.',
  {size:'Small',isSubtle:true});

export function employeeSegmentsHours(e) {
  return ['morning','afternoon'].flatMap(slot => sessionMinutes(e[slot]).map((minutes, i) => ({
    legend:slot === 'morning' ? (i ? 'Sáng · phiên ' + (i+1) : 'Sáng')
      : (i ? 'Chiều · phiên ' + (i+1) : 'Chiều'),
    value:hoursFromMinutes(minutes),
    color:slot === 'morning' ? 'categoricalBlue' : i ? 'categoricalTeal' : 'categoricalGreen'
  })));
}
export function recordedMinutes(e) {
  return [...sessionMinutes(e.morning), ...sessionMinutes(e.afternoon)].reduce((a,b)=>a+b,0);
}
export function chartName(name) {
  const parts = String(name).trim().split(/\s+/);
  return parts.length <= 2 ? name : parts.slice(-2).join(' ');
}
export function statusChartColor(e) {
  if (e.status === 'Cần đối soát') return 'attention';
  if (e.status === 'Chưa chốt') return 'warning';
  return 'good';
}
export function workforceRecordedHoursChart(s) {
  return {
    type:'Chart.HorizontalBar',
    id:'workforce-recorded-hours',
    title:'Giờ công theo nhân sự',
    showTitle:false,
    showLegend:false,
    showBarValues:true,
    displayMode:'AbsoluteNoAxis',
    spacing:'Small',
    data:s.employees.map((e,i)=>({
      x:String(i+1).padStart(2,'0') + ' · ' + chartName(e.name),
      y:chartHours(recordedMinutes(e)),
      color:statusChartColor(e)
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
    title:'Phân bổ giờ theo ca',
    showTitle:false,
    showLegend:true,
    showBarValues:true,
    spacing:'Small',
    data:[{
      title:'Tổng giờ phiên',
      data:[
        {legend:'Ca sáng',value:chartHours(morning),color:'categoricalBlue'},
        {legend:'Ca chiều',value:chartHours(afternoon),color:'categoricalGreen'}
      ]
    }],
    fallback:chartFallback()
  };
}
function statusSummary(e) {
  return e.total === e.status ? e.total : e.total + ' · ' + e.status;
}
export function employeeCompactRow(e, i) {
  return {
    type:'Container',
    id:'employee-' + (i+1),
    style:rowStyle(e),
    roundedCorners:true,
    separator:i>0,
    spacing:'Small',
    items:[
      {
        type:'ColumnSet',
        spacing:'None',
        columns:[
          {type:'Column',width:'stretch',items:[
            text(String(i+1).padStart(2,'0') + ' · ' + e.name,{size:'Small',weight:'Bolder'})
          ]},
          {type:'Column',width:'auto',items:[
            text(statusSummary(e),{size:'Small',weight:'Bolder',color:statusColor(e),horizontalAlignment:'Right'})
          ]}
        ]
      },
      rich([
        inline('SÁNG  ',{weight:'Bolder',color:'Accent',size:'Small'}),
        inline(e.morning,{size:'Small'})
      ],{spacing:'Small'}),
      rich([
        inline('CHIỀU  ',{weight:'Bolder',color:'Good',size:'Small'}),
        inline(e.afternoon,{size:'Small'})
      ],{spacing:'Small'})
    ]
  };
}
export function confirmedChart(s) {
  const data = s.employees.flatMap(e => e.status === 'Đã ghi nhận'
    ? [{x:e.name + ' · ' + e.total, y:hoursFromMinutes(durationMinutes(e.total)), color:'categoricalGreen'}]
    : []);
  if (!data.length) return text('Chưa có tổng công đã chốt để so sánh.', {size:'Small'});
  return {
    type:'Chart.HorizontalBar',
    id:'confirmed-comparison',
    title:'Tổng công đã chốt',
    showTitle:false,
    showLegend:false,
    showBarValues:false,
    xAxisTitle:'Giờ',
    spacing:'Small',
    data,
    fallback:chartFallback()
  };
}
export function statusStrip(s) {
  const data = [
    ['Đã ghi nhận','good'],['Chưa chốt','warning'],
    ['Cần đối soát','attention'],['Chưa có bản ghi','neutral']
  ].map(([legend,color]) => ({legend,color,value:s.employees.filter(e=>e.status===legend).length}))
    .filter(p=>p.value>0);
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

export function buildNativeCard(source) {
  const s=validateSource(source), k=s.kpis;
  const kpis=[
    ['Tổng nhân sự',k.total,'Accent'],
    ['Có dữ liệu',k.with_record,'Good'],
    ['Đã chốt',k.closed,'Good'],
    ['Cần kiểm tra',k.attention,'Attention']
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
      text('TEST · NATIVE V7 · MOBILE FIRST',{size:'Small',color:'Accent',weight:'Bolder'}),
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

      rich([
        inline('Tổng giờ xác nhận  ',{size:'Small'}),
        inline(s.total_hours,{weight:'Bolder',size:'Large',color:'Good'}),
        inline('   ·   Có bản ghi  ',{size:'Small'}),
        inline(s.rate,{weight:'Bolder',size:'Medium'})
      ],{spacing:'Small'}),

      text('GIỜ CÔNG THEO NHÂN SỰ',{size:'Medium',weight:'Bolder',spacing:'Medium'}),
      text('Giá trị hiển thị trực tiếp ở cuối thanh · đơn vị giờ · làm tròn 0,1 giờ.',
        {size:'Small',isSubtle:true,spacing:'Small'}),
      workforceRecordedHoursChart(s),
      text('Xanh: đã ghi nhận · Vàng: chưa chốt · Đỏ: cần đối soát',
        {size:'Small',isSubtle:true,spacing:'Small'}),

      text('CHỈ SỐ NHANH',{size:'Medium',weight:'Bolder',spacing:'Medium'}),
      text('Phân bổ các phiên đã có thời lượng',{size:'Small',weight:'Bolder'}),
      aggregateShiftMixChart(s),
      text('Tình trạng chấm công',{size:'Small',weight:'Bolder',spacing:'Small'}),
      statusStrip(s),

      {
        type:'ActionSet',
        id:'details-toggle',
        spacing:'Medium',
        actions:[{
          type:'Action.ToggleVisibility',
          title:'Xem / Ẩn chi tiết giờ vào / ra (8)',
          targetElements:['attendance-details-panel']
        }]
      },
      {
        type:'Container',
        id:'attendance-details-panel',
        isVisible:false,
        style:'default',
        roundedCorners:true,
        spacing:'Small',
        items:[
          text('CHI TIẾT GIỜ VÀO / RA',{size:'Medium',weight:'Bolder'}),
          text('Đủ giờ Sáng / Chiều của 8 nhân sự · bấm nút phía trên để thu gọn.',
            {size:'Small',isSubtle:true,spacing:'Small'}),
          ...s.employees.map(employeeCompactRow)
        ]
      },

      ...(s.attention_summary ? [{
        type:'Container',
        style:'attention',
        roundedCorners:true,
        spacing:'Small',
        items:[text('Cần chú ý: ' + s.attention_summary,{size:'Small',color:'Attention',weight:'Bolder'})]
      }] : []),

      text('Số liệu phục vụ đối soát, không mặc nhiên là công chính thức. Sai lệch vui lòng phản hồi P.HC-NS.',
        {size:'Small',isSubtle:true,spacing:'Small'})
    ]
  };
}

export function auditCard(card, source) {
  validateSource(source);
  const json=JSON.stringify(card);
  if (Buffer.byteLength(json)>27000) fail('Card payload budget exceeded');
  const ids=new Set(), types=[];
  const walk=v=>{
    if (typeof v==='function' || typeof v==='undefined') fail('Not pure JSON');
    if (!v || typeof v!=='object') return;
    if (v.type) types.push(v.type);
    if (v.id) { if(ids.has(v.id)) fail('Duplicate element id'); ids.add(v.id); }
    if (['Image','Table','TabSet','Accordion','Chart.VerticalBar','Chart.VerticalBar.Grouped'].includes(v.type)) fail('Noncompact or external visual forbidden');
    if ('url' in v || 'backgroundImage' in v) fail('No external resources');
    for(const value of Object.values(v)) walk(value);
  };
  walk(card);
  if (json !== JSON.stringify(buildNativeCard(source))) fail('Layout/data mismatch');
  if (json.includes('Phút') || json.includes('phút')) fail('Minute-based visual labels are forbidden');
  return {
    layout_version:LAYOUT,
    source_kind:'design_test_fixture',
    target_date:source.target_date,
    source_data_sha256:sourceDigest(source),
    card_sha256:digest(json),
    bytes:Buffer.byteLength(json),
    employee_count:source.employees.length,
    kpi_count:4,
    table_count:0,
    chart_count:types.filter(t=>t.startsWith('Chart.')).length,
    data_gate:'passed',
    chart_unit:'hours',
    native_schema_contract:'documented_native_elements',
    external_chart_requests:0,
    image_generation:false,
    all_sessions_visible_by_default:false,
    collapsible_detail_panel:true,
    render_qa:'pending_designer_and_real_teams_clients'
  };
}
