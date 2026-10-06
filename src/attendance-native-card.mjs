import { createHash } from 'node:crypto';

export const LAYOUT = 'ATTENDANCE_MS_NATIVE_V1';
export const TEST_CHAT = '19:0e02d613cded448892f27d74cff19d63@thread.v2';
const DATA_KEYS = ['target_date', 'date_label', 'updated', 'kpis', 'total_hours', 'rate', 'attention_summary', 'employees'];
const fail = (message) => { throw new Error(`NATIVE_CARD_GATE: ${message}`); };
export const digest = (v) => createHash('sha256').update(v).digest('hex');
export const sourceDigest = (s) => digest(JSON.stringify(Object.fromEntries(DATA_KEYS.map(k => [k, s[k]]))));

// Unit conversion only. Never manufacture an unconfirmed daily total from sessions.
export function durationMinutes(value) {
  const match = /^(\d+)h([0-5]\d)$/.exec(String(value));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
export function sessionMinutes(value) {
  if (value === '—') return [];
  return value.split('; ').flatMap(session => {
    const m = /^\d{2}:\d{2}–\d{2}:\d{2} \((\d+h[0-5]\d)\)$/.exec(session);
    if (m) return [durationMinutes(m[1])];
    if (/^\d{2}:\d{2}–—$/.test(session)) return []; // Open session, NOT zero.
    fail('Unknown session syntax');
  });
}
export function validateSource(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s?.target_date || '')) fail('Missing report date');
  if (!/^\d{2}:\d{2}$/.test(s.updated || '')) fail('Missing source update time');
  const [yyyy, mm, dd] = s.target_date.split('-');
  if (!String(s.date_label).includes(`${dd}/${mm}/${yyyy}`)) fail('Date label mismatch');
  if (!Array.isArray(s.employees) || s.employees.length !== 8 || s.kpis?.total !== 8) fail('Exactly eight employees required');
  const names = new Set();
  for (const e of s.employees) {
    for (const key of ['name', 'morning', 'afternoon', 'total', 'status']) {
      if (typeof e[key] !== 'string' || !e[key].trim()) fail(`Missing employee ${key}`);
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
  if (records.length !== s.kpis.with_record || s.rate !== `${records.length / 8 * 100}%`) fail('Record KPI mismatch');
  if (durationMinutes(s.total_hours) !== closed.reduce((n, e) => n + durationMinutes(e.total), 0)) fail('Confirmed hours mismatch');
  const attention = s.employees.filter(e => e.attention).map(e => `${e.name} — ${e.status}`).join(' · ');
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
  type:'ColumnSet', spacing:'Small',
  columns:[
    {type:'Column', width:'24px', verticalContentAlignment:'Center', items:[icon(name)]},
    {type:'Column', width:'stretch', items:[t(text,{size:'Medium',weight:'Bolder'})]}
  ]
});
function chartFallback(s) {
  return t('Thiết bị này chưa hiển thị biểu đồ native. Giờ chốt và toàn bộ phiên chấm công vẫn có trong bảng bên dưới.',
    {size:'Small', color:'Default'});
}
export function confirmedChart(s) {
  return {
    type:'Chart.VerticalBar', title:'Tổng công đã chốt', showTitle:false,
    showLegend:false, showBarValues:false, yAxisTitle:'Phút', yMin:0, spacing:'Small',
    // Exact clock labels are displayed verbatim; numeric geometry uses integer minutes.
    data:s.employees.flatMap((e, i) => e.status === 'Đã ghi nhận'
      ? [{x:`${String(i+1).padStart(2,'0')} · ${e.total}`, y:durationMinutes(e.total), color:'categoricalGreen'}] : []),
    fallback:chartFallback(s)
  };
}
export function shiftsChart(s) {
  const slots = ['morning', 'afternoon'];
  const data = [];
  for (const slot of slots) {
    const parsed = s.employees.map(e => sessionMinutes(e[slot]));
    const max = Math.max(0, ...parsed.map(a => a.length));
    for (let i=0; i<max; i++) {
      data.push({
        legend:`${slot === 'morning' ? 'Sáng' : 'Chiều'}${max > 1 ? ` · phiên ${i+1}` : ''}`,
        color:slot === 'morning' ? 'categoricalBlue' : i === 0 ? 'categoricalGreen' : 'categoricalTeal',
        values:parsed.flatMap((a, n) => a[i] === undefined ? [] : [{x:String(n+1).padStart(2,'0'), y:a[i]}])
      });
    }
  }
  return {
    type:'Chart.VerticalBar.Grouped', title:'Thời lượng từng phiên', showTitle:false,
    stacked:true, showBarValues:false, showLegend:true, yAxisTitle:'Phút',
    xAxisTitle:'STT theo bảng nhân sự', data, fallback:chartFallback(s)
  };
}
function statusStrip(s) {
  const statuses = [
    ['Đã ghi nhận','good'], ['Chưa chốt','warning'],
    ['Cần đối soát','attention'], ['Chưa có bản ghi','neutral']
  ];
  const data = statuses.map(([legend,color]) => ({legend,color,value:s.employees.filter(e => e.status === legend).length})).filter(p => p.value);
  return {
    type:'Chart.HorizontalBar.Stacked', title:'Cơ cấu trạng thái', showTitle:false, showLegend:true,
    spacing:'Small', data:[{title:`${s.kpis.total} nhân sự`,data}],
    fallback:t(data.map(p => `${p.legend}: ${p.value}`).join(' · '),{size:'Small'})
  };
}
function statusText(e, size='Small') {
  return rich([
    run(e.total,{weight:'Bolder',color:statusColor(e),size}),
    run(` · ${e.status}`,{color:statusColor(e),size})
  ]);
}
export function desktopTable(s) {
  const headers=['Nhân sự','Ca sáng','Ca chiều','Tổng / trạng thái'];
  return {
    type:'Table', id:'details-desktop', targetWidth:'atLeast:Standard',
    columns:[{width:25},{width:23},{width:31},{width:21}],
    firstRowAsHeader:true, showGridLines:false, spacing:'Small',
    rows:[
      {type:'TableRow',cells:headers.map(v => cell([t(v,{size:'Small',weight:'Bolder',color:'Accent'})],'emphasis'))},
      ...s.employees.map((e,i) => {
        const style=rowStyle(e,i);
        return {type:'TableRow',cells:[
          cell([t(`${String(i+1).padStart(2,'0')}  ${e.name}`,{size:'Small',weight:'Bolder'})],style),
          cell([t(e.morning,{size:'Small'})],style),
          cell([t(e.afternoon,{size:'Small'})],style),
          cell([statusText(e)],style)
        ]};
      })
    ]
  };
}
export function mobileTable(s) {
  return {
    type:'Table', id:'details-mobile', targetWidth:'atMost:Narrow',
    columns:[{width:39},{width:61}], firstRowAsHeader:true, showGridLines:false, spacing:'Small',
    rows:[
      {type:'TableRow',cells:[
        cell([t('Nhân sự / tổng',{size:'Small',weight:'Bolder',color:'Accent'})],'emphasis'),
        cell([t('Giờ vào–ra · thời lượng',{size:'Small',weight:'Bolder',color:'Accent'})],'emphasis')
      ]},
      ...s.employees.map((e,i) => {
        const style=rowStyle(e,i);
        return {type:'TableRow',cells:[
          cell([
            t(`${String(i+1).padStart(2,'0')}  ${e.name}`,{weight:'Bolder'}),
            statusText(e)
          ],style),
          cell([
            rich([run('Sáng  ',{weight:'Bolder',color:'Accent'}),run(e.morning)]),
            rich([run('Chiều  ',{weight:'Bolder',color:'Good'}),run(e.afternoon)],{spacing:'Small'})
          ],style)
        ]};
      })
    ]
  };
}
export function buildNativeCard(source) {
  const s=validateSource(source), k=s.kpis;
  const kpis=[['Tổng nhân sự',k.total,'Accent'],['Có dữ liệu',k.with_record,'Good'],['Đã chốt',k.closed,'Good'],['Cần kiểm tra',k.attention,'Attention']];
  return {
    type:'AdaptiveCard', $schema:'https://adaptivecards.io/schemas/adaptive-card.json',
    version:'1.5', lang:'vi', msteams:{width:'Full'},
    body:[
      t('TEST · ADAPTIVE CARD NATIVE',{size:'Small',weight:'Bolder',color:'Accent'}),
      t('BÁO CÁO CHẤM CÔNG — CẢ NGÀY',{size:'Large',weight:'Bolder',spacing:'Small'}),
      t(`${s.date_label} · Cập nhật dữ liệu: ${s.updated}`,{size:'Small',isSubtle:true,spacing:'Small'}),
      {
        type:'Container',style:'emphasis',showBorder:true,roundedCorners:true,spacing:'Small',
        items:[{type:'ColumnSet',spacing:'None',columns:kpis.map(([label,value,color]) => ({
          type:'Column',width:1,spacing:'Small',items:[
            t(String(value),{size:'ExtraLarge',weight:'Bolder',color,horizontalAlignment:'Center'}),
            t(label,{size:'Small',horizontalAlignment:'Center'})
          ]
        }))}]
      },
      rich([
        run('Tổng giờ xác nhận  ',{color:'Accent'}),
        run(s.total_hours,{weight:'Bolder',size:'Large'}),
        run('   ·   Có bản ghi  ',{color:'Good'}),
        run(s.rate,{weight:'Bolder'})
      ],{spacing:'Small'}),
      section('DataBarVertical','GIỜ CÔNG & PHIÊN CHẤM CÔNG'),
      {
        type:'Container',id:'view-shifts',spacing:'Small',showBorder:true,roundedCorners:true,
        items:[
          t('8 nhân sự · Thời lượng các phiên sáng / chiều',{size:'Small',weight:'Bolder'}),
          shiftsChart(s),
          t('Chỉ biểu diễn phiên đã có thời lượng; không coi tổng độ dài các phiên là tổng công đã chốt.',{size:'Small',isSubtle:true})
        ]
      },
      {
        type:'Container',id:'view-confirmed',isVisible:false,spacing:'Small',showBorder:true,roundedCorners:true,
        items:[
          t(`${k.closed} nhân sự đã chốt · Nhãn STT và giờ nguyên bản`,{size:'Small',weight:'Bolder'}),
          confirmedChart(s),
          t('Người chưa chốt không được quy thành 0 giờ, không tự cộng phiên thành tổng công.',{size:'Small',isSubtle:true})
        ]
      },
      {
        type:'ActionSet',spacing:'Small',actions:[{
          type:'Action.ToggleVisibility',title:'Đổi biểu đồ: theo ca / tổng đã chốt',
          targetElements:['view-shifts','view-confirmed']
        }]
      },
      statusStrip(s),
      section('People','CHI TIẾT GIỜ VÀO / RA'),
      desktopTable(s),
      mobileTable(s),
      {
        type:'Container',style:'attention',roundedCorners:true,spacing:'Small',
        items:[t(`Cần chú ý: ${s.attention_summary}`,{size:'Small',weight:'Bolder',color:'Attention'})]
      },
      t('Lưu ý: Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh.',
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
      if (!json.includes(e[field])) fail(`Missing literal ${field}`);
    }
  }
  for (const kind of ['Chart.VerticalBar','Chart.VerticalBar.Grouped','Chart.HorizontalBar.Stacked','Table']) {
    if (!types.includes(kind)) fail(`Missing ${kind}`);
  }
  return {
    layout_version:LAYOUT, source_kind:'design_test_fixture', target_date:source.target_date,
    source_data_sha256:sourceDigest(source), card_sha256:digest(json),
    bytes:Buffer.byteLength(json), employee_count:source.employees.length,
    kpi_count:4, data_gate:'passed', native_schema_contract:'checked_documented_fields',
    external_chart_requests:0, image_generation:false,
    render_qa:'pending_designer_and_real_teams_clients'
  };
}
