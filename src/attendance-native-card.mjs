import { createHash } from 'node:crypto';

export const LAYOUT = 'ATTENDANCE_MS_NATIVE_V2';
export const TEST_CHAT = '19:0e02d613cded448892f27d74cff19d63@thread.v2';
const DATA_KEYS = ['target_date', 'date_label', 'updated', 'kpis', 'total_hours', 'rate', 'attention_summary', 'employees'];
const fail = (message) => { throw new Error(\`NATIVE_CARD_GATE: \${message}\`); };
export const digest = (v) => createHash('sha256').update(v).digest('hex');
export const sourceDigest = (s) => digest(JSON.stringify(Object.fromEntries(DATA_KEYS.map(k => [k, s[k]]))));

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
export function validateSource(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s?.target_date || '')) fail('Missing report date');
  if (!/^\d{2}:\d{2}$/.test(s.updated || '')) fail('Missing source update time');
  const [yyyy, mm, dd] = s.target_date.split('-');
  if (!String(s.date_label).includes(\`\${dd}/\${mm}/\${yyyy}\`)) fail('Date label mismatch');
  if (!Array.isArray(s.employees) || s.employees.length !== 8 || s.kpis?.total !== 8) fail('Exactly eight employees required');
  const names = new Set();
  for (const e of s.employees) {
    for (const key of ['name', 'morning', 'afternoon', 'total', 'status']) {
      if (typeof e[key] !== 'string' || !e[key].trim()) fail(\`Missing employee \${key}\`);
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
  if (records.length !== s.kpis.with_record || s.rate !== \`\${records.length / 8 * 100}%\`) fail('Record KPI mismatch');
  if (durationMinutes(s.total_hours) !== closed.reduce((n, e) => n + durationMinutes(e.total), 0)) fail('Confirmed hours mismatch');
  const attention = s.employees.filter(e => e.attention).map(e => \`\${e.name} — \${e.status}\`).join(' · ');
  if (attention !== s.attention_summary) fail('Attention summary mismatch');
  return s;
}

const t = (text, options = {}) => ({type:'TextBlock', text, wrap:true, spacing:'None', ...options});
const run = (text, options = {}) => ({type:'TextRun', text, ...options});
const rich = (inlines, options = {}) => ({type:'RichTextBlock', inlines, spacing:'None', ...options});
const statusColor = e => e.status === 'Cần đối soát' ? 'Attention' : e.status === 'Chưa chốt' ? 'Warning' : e.status === 'Đã ghi nhận' ? 'Good' : 'Default';
const rowStyle = (e, i) => e.status === 'Cần đối soát' ? 'attention' : e.status === 'Chưa chốt' ? 'warning' : i % 2 ? 'emphasis' : 'default';
const cell = (items, style='default') => ({type:'TableCell', style, verticalContentAlignment:'Center', items});
const icon = (name, color='Accent') => ({type:'Icon', name, color, size:'Small', style:'Regular', fallback:'drop'});

const section = (name, text) => ({
  type:'ColumnSet',
  spacing:'Small',
  columns:[
    {type:'Column', width:'24px', verticalContentAlignment:'Center', items:[icon(name)]},
    {type:'Column', width:'stretch', items:[t(text,{size:'Medium',weight:'Bolder'})]}
  ]
});

function chartFallback() {
  return t('Thiết bị này chưa hiển thị biểu đồ native. Toàn bộ giờ vào/ra vẫn có ngay bên dưới.',
    {size:'Small', color:'Default'});
}

export function chartName(name) {
  const parts = String(name).trim().split(/\s+/);
  return parts.length <= 2 ? name : parts.slice(-2).join(' ');
}

export function groupedShiftChart(s, indexes, showLegend=true) {
  const picked = indexes.map(i => s.employees[i]);
  const series = [];
  for (const slot of ['morning','afternoon']) {
    const parsed = picked.map(e => sessionMinutes(e[slot]));
    const max = Math.max(0, ...parsed.map(a => a.length));
    for (let sessionIndex=0; sessionIndex<max; sessionIndex++) {
      series.push({
        legend:slot === 'morning'
          ? 'Ca sáng'
          : sessionIndex === 0 ? 'Ca chiều' : \`Chiều · phiên \${sessionIndex+1}\`,
        color:slot === 'morning'
          ? 'categoricalBlue'
          : sessionIndex === 0 ? 'categoricalGreen' : 'categoricalTeal',
        values:parsed.flatMap((sessions, localIndex) => sessions[sessionIndex] === undefined
          ? []
          : [{x:chartName(picked[localIndex].name), y:sessions[sessionIndex]}])
      });
    }
  }
  return {
    type:'Chart.VerticalBar.Grouped',
    title:'Thời lượng theo ca',
    showTitle:false,
    stacked:true,
    showBarValues:false,
    showLegend,
    yAxisTitle:'Phút',
    yMin:0,
    spacing:'Small',
    data:series,
    fallback:chartFallback()
  };
}

function statusText(e, size='Small') {
  return rich([
    run(e.total,{weight:'Bolder',color:statusColor(e),size}),
    run(\` · \${e.status}\`,{color:statusColor(e),size})
  ]);
}

export function employeeDetailTable(s, indexes) {
  const picked = indexes.map(i => s.employees[i]);
  return {
    type:'Table',
    columns:[{width:36},{width:64}],
    firstRowAsHeader:false,
    showGridLines:false,
    spacing:'Small',
    rows:picked.map((e, localIndex) => {
      const globalIndex = indexes[localIndex];
      const style=rowStyle(e,globalIndex);
      return {
        type:'TableRow',
        cells:[
          cell([
            t(\`\${String(globalIndex+1).padStart(2,'0')}  \${e.name}\`,{size:'Small',weight:'Bolder'}),
            statusText(e)
          ],style),
          cell([
            rich([run('Sáng  ',{weight:'Bolder',color:'Accent',size:'Small'}),run(e.morning,{size:'Small'})]),
            rich([run('Chiều  ',{weight:'Bolder',color:'Good',size:'Small'}),run(e.afternoon,{size:'Small'})],{spacing:'Small'})
          ],style)
        ]
      };
    })
  };
}

function responsiveKpis(kpis) {
  const makeColumns = entries => ({
    type:'ColumnSet',
    spacing:'None',
    columns:entries.map(([label,value,color]) => ({
      type:'Column',
      width:1,
      spacing:'Small',
      items:[
        t(String(value),{size:'ExtraLarge',weight:'Bolder',color,horizontalAlignment:'Center'}),
        t(label,{size:'Small',horizontalAlignment:'Center'})
      ]
    }))
  });
  return [
    {
      type:'Container',
      targetWidth:'atLeast:Standard',
      style:'emphasis',
      showBorder:true,
      roundedCorners:true,
      spacing:'Small',
      items:[makeColumns(kpis)]
    },
    {
      type:'Container',
      targetWidth:'atMost:Narrow',
      style:'emphasis',
      showBorder:true,
      roundedCorners:true,
      spacing:'Small',
      items:[
        makeColumns(kpis.slice(0,2)),
        {...makeColumns(kpis.slice(2)),spacing:'Small'}
      ]
    }
  ];
}

function employeeGroup(s, indexes, label, showLegend) {
  return {
    type:'Container',
    style:'default',
    showBorder:true,
    roundedCorners:true,
    spacing:'Medium',
    items:[
      {
        type:'ColumnSet',
        spacing:'None',
        columns:[
          {type:'Column',width:'stretch',items:[t(label,{size:'Small',weight:'Bolder',color:'Accent'})]},
          {type:'Column',width:'auto',items:[t('Cột = thời lượng phiên',{size:'Small',isSubtle:true,horizontalAlignment:'Right'})]}
        ]
      },
      groupedShiftChart(s,indexes,showLegend),
      t('GIỜ VÀO / RA · TỔNG / TRẠNG THÁI',{size:'Small',weight:'Bolder',color:'Accent',separator:true,spacing:'Small'}),
      employeeDetailTable(s,indexes)
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
      t('TEST · ADAPTIVE CARD NATIVE V2',{size:'Small',weight:'Bolder',color:'Accent'}),
      t('BÁO CÁO CHẤM CÔNG — CẢ NGÀY',{size:'Large',weight:'Bolder',spacing:'Small'}),
      {
        type:'ColumnSet',
        spacing:'Small',
        columns:[
          {type:'Column',width:'stretch',items:[t(s.date_label,{size:'Small',isSubtle:true})]},
          {type:'Column',width:'auto',items:[t(\`Cập nhật \${s.updated}\`,{size:'Small',isSubtle:true,horizontalAlignment:'Right'})]}
        ]
      },
      ...responsiveKpis(kpis),
      rich([
        run('Tổng giờ xác nhận  ',{color:'Accent',size:'Small'}),
        run(s.total_hours,{weight:'Bolder',size:'Medium'}),
        run('   ·   Có bản ghi  ',{color:'Good',size:'Small'}),
        run(s.rate,{weight:'Bolder',size:'Medium'})
      ],{spacing:'Small'}),
      section('DataBarVertical','GIỜ CÔNG THEO NHÂN SỰ'),
      t('Chia 2 cụm để tên và cột lớn, dễ đọc trên điện thoại. Mỗi chart đi kèm giờ sáng/chiều ngay bên dưới.',
        {size:'Small',isSubtle:true,spacing:'Small'}),
      employeeGroup(s,[0,1,2,3],'01–04 · NHÓM 1',true),
      employeeGroup(s,[4,5,6,7],'05–08 · NHÓM 2',false),
      {
        type:'Container',
        style:'attention',
        roundedCorners:true,
        spacing:'Medium',
        items:[t(\`Cần chú ý: \${s.attention_summary}\`,{size:'Small',weight:'Bolder',color:'Attention'})]
      },
      t('Lưu ý: Cột biểu đồ chỉ biểu diễn các phiên đã có thời lượng. Tổng công/trạng thái được giữ nguyên theo dữ liệu nguồn ở từng hàng nhân sự.',
        {size:'Small',isSubtle:true,spacing:'Small'})
    ]
  };
}

export function auditCard(card, source) {
  validateSource(source);
  const json=JSON.stringify(card);
  if (Buffer.byteLength(json)>27000) fail('Card payload budget exceeded');
  const types=[];
  const walk=v => {
    if (typeof v==='function' || typeof v==='undefined') fail('Not pure JSON');
    if (!v || typeof v!=='object') return;
    if (v.type) types.push(v.type);
    if (['Image','TabSet','Accordion'].includes(v.type)) fail('External/preview visual forbidden in native test');
    if ('url' in v || 'backgroundImage' in v) fail('No external resources in native card');
    for (const value of Object.values(v)) walk(value);
  };
  walk(card);
  for (const e of source.employees) {
    for (const field of ['name','morning','afternoon','total','status']) {
      if (!json.includes(e[field])) fail(\`Missing literal \${field}\`);
    }
  }
  if (types.filter(v => v==='Chart.VerticalBar.Grouped').length !== 2) fail('Exactly two grouped employee charts required');
  if (types.filter(v => v==='Table').length !== 2) fail('Exactly two employee detail tables required');
  return {
    layout_version:LAYOUT,
    source_kind:'design_test_fixture',
    target_date:source.target_date,
    source_data_sha256:sourceDigest(source),
    card_sha256:digest(json),
    bytes:Buffer.byteLength(json),
    employee_count:source.employees.length,
    kpi_count:4,
    chart_count:2,
    table_count:2,
    data_gate:'passed',
    native_schema_contract:'checked_documented_fields',
    external_chart_requests:0,
    image_generation:false,
    render_qa:'pending_designer_and_real_teams_clients'
  };
}
