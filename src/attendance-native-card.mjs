import { createHash } from 'node:crypto';

export const LAYOUT = 'ATTENDANCE_MOBILE_NATIVE_V4_HOURS';
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
  const parts = s.target_date.split('-');
  const yyyy = parts[0], mm = parts[1], dd = parts[2];
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
const rowStyle = (e, i) => e.status === 'Cần đối soát' ? 'attention'
  : e.status === 'Chưa chốt' ? 'warning' : i % 2 ? 'emphasis' : 'default';
const chartFallback = () => text('Thiết bị này chưa hiển thị biểu đồ native; dữ liệu giờ vẫn có đầy đủ ngay bên dưới.',
  {size:'Small',isSubtle:true});

export function chartName(name) {
  const parts = String(name).trim().split(/\s+/);
  return parts.length <= 2 ? name : parts.slice(-2).join(' ');
}
export function employeeSegmentsHours(e) {
  return ['morning','afternoon'].flatMap(slot => sessionMinutes(e[slot]).map((minutes, i) => ({
    legend:slot === 'morning' ? (i ? 'Sáng · phiên ' + (i+1) : 'Sáng')
      : (i ? 'Chiều · phiên ' + (i+1) : 'Chiều'),
    value:hoursFromMinutes(minutes),
    color:slot === 'morning' ? 'categoricalBlue' : i ? 'categoricalTeal' : 'categoricalGreen'
  })));
}
export function workforceHoursChart(s) {
  return {
    type:'Chart.HorizontalBar.Stacked',
    id:'workforce-hours-chart',
    title:'Giờ công theo ca',
    showTitle:false,
    showLegend:true,
    showBarValues:false,
    xAxisTitle:'Giờ',
    spacing:'Small',
    data:s.employees.map((e,i) => ({
      title:String(i+1).padStart(2,'0') + ' · ' + chartName(e.name),
      data:employeeSegmentsHours(e)
    })),
    fallback:chartFallback()
  };
}
export function confirmedChart(s) {
  const data = s.employees.flatMap(e => e.status === 'Đã ghi nhận'
    ? [{x:chartName(e.name) + ' · ' + e.total, y:hoursFromMinutes(durationMinutes(e.total)), color:'categoricalGreen'}]
    : []);
  if (!data.length) return text('Chưa có tổng công đã chốt để so sánh.', {size:'Small'});
  return {
    type:'Chart.HorizontalBar',
    id:'confirmed-comparison',
    title:'Tổng công đã chốt',
    showTitle:false,
    showLegend:false,
    showBarValues:false,
    xAxisTitle:'Giờ đã chốt',
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
    spacing:'Small',
    data:[{title:'8 nhân sự',data}],
    fallback:chartFallback()
  };
}
function statusSummary(e) {
  return e.total === e.status ? e.total : e.total + ' · ' + e.status;
}
export function employeeDetail(e, i) {
  return {
    type:'Container',
    id:'employee-' + (i+1),
    style:rowStyle(e,i),
    separator:i>0,
    roundedCorners:true,
    spacing:'Small',
    items:[
      {
        type:'ColumnSet',
        spacing:'None',
        columns:[
          {type:'Column',width:'stretch',items:[
            text(String(i+1).padStart(2,'0') + '  ' + e.name,{size:'Small',weight:'Bolder'})
          ]},
          {type:'Column',width:'auto',items:[
            text(statusSummary(e),{size:'Small',weight:'Bolder',color:statusColor(e),horizontalAlignment:'Right'})
          ]}
        ]
      },
      rich([
        inline('Sáng  ',{weight:'Bolder',color:'Accent',size:'Small'}),
        inline(e.morning,{size:'Small'}),
        inline('   •   ',{size:'Small',isSubtle:true}),
        inline('Chiều  ',{weight:'Bolder',color:'Good',size:'Small'}),
        inline(e.afternoon,{size:'Small'})
      ],{spacing:'None'})
    ]
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
  return {
    type:'AdaptiveCard',
    $schema:'https://adaptivecards.io/schemas/adaptive-card.json',
    version:'1.5',
    lang:'vi',
    msteams:{width:'Full'},
    body:[
      text('TEST · NATIVE V4 · GIỜ',{size:'Small',color:'Accent',weight:'Bolder'}),
      text('BÁO CÁO CHẤM CÔNG — CẢ NGÀY',{size:'Large',weight:'Bolder',spacing:'Small'}),
      text(s.date_label + ' · Cập nhật ' + s.updated,{size:'Small',isSubtle:true,spacing:'Small'}),
      {
        type:'Container',id:'kpi-strip',style:'emphasis',roundedCorners:true,spacing:'Small',
        items:[{
          type:'ColumnSet',spacing:'None',
          columns:kpis.map(([label,value,color])=>({
            type:'Column',width:1,spacing:'Small',items:[
              text(String(value),{size:'ExtraLarge',weight:'Bolder',color,horizontalAlignment:'Center'}),
              text(label,{size:'Small',horizontalAlignment:'Center'})
            ]
          }))
        }]
      },
      rich([
        inline('Tổng giờ xác nhận  ',{size:'Small'}),
        inline(s.total_hours,{weight:'Bolder',size:'Large',color:'Good'}),
        inline('   ·   Có bản ghi  ',{size:'Small'}),
        inline(s.rate,{weight:'Bolder',size:'Medium'})
      ],{spacing:'Small'}),
      statusStrip(s),
      text('GIỜ CÔNG THEO NHÂN SỰ',{size:'Medium',weight:'Bolder',spacing:'Medium'}),
      text('Thanh ngang dùng đơn vị GIỜ. Xanh dương: sáng · Xanh lá: chiều · Xanh ngọc: phiên bổ sung.',
        {size:'Small',isSubtle:true,spacing:'Small'}),
      workforceHoursChart(s),
      {
        type:'ActionSet',spacing:'Small',actions:[{
          type:'Action.ToggleVisibility',
          title:'Xem so sánh tổng công đã chốt',
          targetElements:['confirmed-panel']
        }]
      },
      {
        type:'Container',id:'confirmed-panel',isVisible:false,spacing:'Small',
        items:[
          text('SO SÁNH TỔNG CÔNG ĐÃ CHỐT',{size:'Small',weight:'Bolder',color:'Accent'}),
          confirmedChart(s),
          text('Chỉ gồm nhân sự đã chốt; trục biểu đồ dùng giờ.',{size:'Small',isSubtle:true})
        ]
      },
      text('GIỜ VÀO / RA',{size:'Medium',weight:'Bolder',spacing:'Medium'}),
      text('Mỗi người chỉ 2 dòng: tổng/trạng thái và đầy đủ ca sáng · ca chiều.',
        {size:'Small',isSubtle:true,spacing:'Small'}),
      ...s.employees.map(employeeDetail),
      ...(s.attention_summary ? [{
        type:'Container',style:'attention',roundedCorners:true,spacing:'Small',
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
    all_sessions_visible_by_default:true,
    render_qa:'pending_designer_and_real_teams_clients'
  };
}
