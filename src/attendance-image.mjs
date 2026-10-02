export const APPROVED_LAYOUT_VERSION = "ATTENDANCE_IMAGE_V3_MOBILE_FIRST_2026_10_02";
export const OVERVIEW_CANVAS = Object.freeze({ width: 1080, height: 1350 });
export const DETAIL_CANVAS = Object.freeze({ width: 1080, height: 1620 });

const MIDDAY = 12 * 60 + 45;
const C = Object.freeze({
  navy:"#052E63", navyDark:"#021B3D", blue:"#2D8CFF", blueSoft:"#EAF4FF",
  green:"#19A660", greenSoft:"#EAF8F0", gold:"#C58A22", goldSoft:"#FFF6E2",
  red:"#EA4050", paper:"#F5FAFE", ink:"#163454", muted:"#667E96", line:"#DCE8F2"
});

function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");}
function fmtMinutes(m){if(!Number.isInteger(m)||m<0)return "—";return Math.floor(m/60)+"h"+String(m%60).padStart(2,"0");}
function dateParts(iso){const m=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)throw new Error("Invalid report date");const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));const n=["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];return {label:n[d.getUTCDay()]+", "+m[3]+"/"+m[2]+"/"+m[1],day:m[3],month:m[2],year:m[1]};}
function minuteOfDay(v){const m=String(v||"").match(/^([01]\d|2[0-3]):([0-5]\d)$/);return m?+m[1]*60 + +m[2]:null;}
function splitSessions(row){const out={morning:[],afternoon:[]};for(const s of Array.isArray(row?.sessions)?row.sessions:[]){const a=minuteOfDay(s?.in||s?.out);if(a==null)continue;(a<MIDDAY?out.morning:out.afternoon).push(s);}return out;}
function sessionMinutes(list){return (list||[]).reduce((sum,s)=>sum+(Number.isInteger(s?.minutes)?s.minutes:0),0);}
function sessionTime(list){if(!Array.isArray(list)||!list.length)return "—";return list.map(s=>(s?.in||"—")+"–"+(s?.out||"—")).join("; ");}
function status(row,slot){const code=String(row?.status_code||"");if(slot==="morning_1230"){if(code==="recorded")return{text:"Đã chấm công",tone:"ok"};if(code==="working")return{text:"Đang làm việc",tone:"ok"};if(code==="not_recorded_morning")return{text:"Chưa chấm công",tone:"bad"};}else{if(code==="recorded")return{text:"Đã ghi nhận",tone:"ok"};if(code==="not_recorded")return{text:"Chưa chấm công",tone:"bad"};if(code==="open_session")return{text:"Chưa chốt",tone:"warn"};}if(code==="technical_error")return{text:"Lỗi nguồn",tone:"bad"};return{text:"Cần đối soát",tone:"warn"};}
function tone(t){return t==="ok"?{bg:"#E8F8EF",fg:"#118A4C",dot:C.green}:t==="bad"?{bg:"#FFF0F2",fg:"#C92D3B",dot:C.red}:{bg:"#FFF5DD",fg:"#9A6800",dot:C.gold};}
function confirmedMinutes(row,slot){return slot==="morning_1230"?(Number.isInteger(row?.morning?.minutes)?row.morning.minutes:null):(Number.isInteger(row?.total_minutes)?row.total_minutes:null);}
function totals(report){const slot=report.slot;const rows=report.employees;const recorded=rows.filter(r=>slot==="morning_1230"?["recorded","working"].includes(String(r?.status_code||"")):String(r?.status_code||"")==="recorded").length;const minutes=rows.reduce((s,r)=>s+(confirmedMinutes(r,slot)||0),0);return{total:rows.length,recorded,review:rows.length-recorded,rate:Math.round(recorded*100/rows.length),minutes};}
function defs(w,h){return [
  '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">',
  '<defs>',
  '<linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".58" stop-color="#F1F8FD"/><stop offset="1" stop-color="#D7ECFA"/></linearGradient>',
  '<linearGradient id="navy" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#021B3D"/><stop offset="1" stop-color="#0A4B84"/></linearGradient>',
  '<linearGradient id="blue" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1974D8"/><stop offset="1" stop-color="#56ABFF"/></linearGradient>',
  '<linearGradient id="green" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#118A4C"/><stop offset="1" stop-color="#55C883"/></linearGradient>',
  '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B97812"/><stop offset="1" stop-color="#E0AE3A"/></linearGradient>',
  '<filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="7" stdDeviation="11" flood-color="#0B365B" flood-opacity=".10"/></filter>',
  '<style>.f{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif}.ey{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:20px;font-weight:800;letter-spacing:1.4px;fill:#A66B00}.title{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:48px;font-weight:900;fill:#052E63}.date{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:25px;font-weight:800;fill:#163454}.muted{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:18px;font-weight:600;fill:#667E96}.klabel{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:18px;font-weight:750;fill:#667E96}.kvalue{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:42px;font-weight:900;fill:#052E63}.name{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:25px;font-weight:850;fill:#163454}.small{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:17px;font-weight:650;fill:#667E96}.value{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:27px;font-weight:850;fill:#052E63}</style>',
  '</defs>',
  '<rect width="'+w+'" height="'+h+'" fill="#F5FAFE"/>'
].join("");}
function officeHero(w=1080){return [
  '<rect x="0" y="0" width="'+w+'" height="255" fill="url(#hero)"/>',
  '<rect x="720" y="25" width="115" height="180" rx="5" fill="#DCEAF5" stroke="#A4BDD2"/>',
  '<rect x="850" y="0" width="150" height="205" rx="5" fill="#E6F2FA" stroke="#94B7D1"/>',
  '<g opacity=".65" stroke="#B8CEE0" stroke-width="2"><line x1="875" y1="20" x2="875" y2="190"/><line x1="915" y1="20" x2="915" y2="190"/><line x1="955" y1="20" x2="955" y2="190"/><line x1="850" y1="55" x2="1000" y2="55"/><line x1="850" y1="100" x2="1000" y2="100"/><line x1="850" y1="145" x2="1000" y2="145"/></g>',
  '<path d="M965 0 L1080 0 L1080 255 L1030 255 L1060 215 L1015 215 L1070 145 Z" fill="#052E63"/>',
  '<path d="M930 0 L970 0 L1070 130 L1047 157 Z" fill="#C58A22" opacity=".74"/>',
  '<g opacity=".9"><path d="M760 205 C750 165 772 140 800 126 C790 160 790 184 805 205 Z" fill="#3D8D6E"/><path d="M800 205 C810 162 839 145 864 143 C845 170 834 190 834 205 Z" fill="#57A47E"/><rect x="785" y="203" width="58" height="28" rx="6" fill="#D8E4EC"/></g>'
].join("");}
function heroText(title,date){const d=dateParts(date);return [
  '<rect x="42" y="35" width="90" height="7" rx="4" fill="url(#gold)"/>',
  '<text x="42" y="82" class="ey">BÁO CÁO CHẤM CÔNG</text>',
  '<text x="42" y="143" class="title">'+esc(title)+'</text>',
  '<text x="42" y="183" class="date">'+esc(d.label)+'</text>',
  '<text x="42" y="222" class="muted">Tổng hợp từ hệ thống chấm công để đối soát</text>',
  '<g filter="url(#shadow)"><rect x="875" y="47" width="140" height="115" rx="16" fill="#FFFFFF" stroke="#DBE6EF"/></g>',
  '<text x="915" y="103" class="f" font-size="42" font-weight="900" fill="#052E63">'+esc(d.day)+'</text>',
  '<text x="975" y="87" class="f" font-size="15" font-weight="700" fill="#667E96">THÁNG '+esc(d.month)+'</text>',
  '<text x="975" y="112" class="f" font-size="15" font-weight="700" fill="#667E96">'+esc(d.year)+'</text>'
].join("");}
function kpi(x,y,w,label,value,accent,detail=""){return [
  '<g filter="url(#shadow)"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="132" rx="22" fill="#FFFFFF" stroke="#DCE7F0"/></g>',
  '<rect x="'+x+'" y="'+y+'" width="8" height="132" rx="4" fill="'+accent+'"/>',
  '<text x="'+(x+28)+'" y="'+(y+42)+'" class="klabel">'+esc(label)+'</text>',
  '<text x="'+(x+28)+'" y="'+(y+92)+'" class="kvalue">'+esc(value)+'</text>',
  detail?'<text x="'+(x+w-24)+'" y="'+(y+95)+'" text-anchor="end" class="small">'+esc(detail)+'</text>':""
].join("");}
function donut(cx,cy,r,rate){const circ=2*Math.PI*r,good=circ*Math.max(0,Math.min(100,rate))/100;return [
  '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="#E7EEF4" stroke-width="27"/>',
  '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="#19A660" stroke-width="27" stroke-linecap="round" transform="rotate(-90 '+cx+' '+cy+')" stroke-dasharray="'+good.toFixed(1)+' '+(circ-good).toFixed(1)+'"/>',
  '<text x="'+cx+'" y="'+(cy+13)+'" text-anchor="middle" class="f" font-size="47" font-weight="900" fill="#0C7141">'+rate+'%</text>'
].join("");}
function overviewBars(report){const slot=report.slot,rows=report.employees;const x=55,y=850,w=970,rowH=51,max=slot==="morning_1230"?300:600;const out=[
  '<g filter="url(#shadow)"><rect x="35" y="800" width="1010" height="445" rx="24" fill="#FFFFFF" stroke="#DCE7F0"/></g>',
  '<text x="60" y="843" class="f" font-size="23" font-weight="850" fill="#052E63">'+(slot==="morning_1230"?"GIỜ CÔNG CA SÁNG THEO NHÂN SỰ":"TỔNG CÔNG THEO NHÂN SỰ")+'</text>'
];
rows.forEach((row,i)=>{const ry=y+i*rowH;const name=String(row.name||"");const short=name.split(" ").slice(-2).join(" ");if(slot==="morning_1230"){const m=confirmedMinutes(row,slot);const bw=m==null?0:Math.min(1,m/max)*540;out.push('<text x="'+x+'" y="'+(ry+28)+'" class="f" font-size="17" font-weight="750" fill="#163454">'+esc(short)+'</text>','<rect x="250" y="'+(ry+13)+'" width="540" height="22" rx="11" fill="#E7EEF5"/>',bw?'<rect x="250" y="'+(ry+13)+'" width="'+bw.toFixed(1)+'" height="22" rx="11" fill="url(#blue)"/>':"",' <text x="815" y="'+(ry+31)+'" class="f" font-size="18" font-weight="850" fill="#052E63">'+esc(m==null?"—":fmtMinutes(m))+'</text>');}else{const p=splitSessions(row),am=sessionMinutes(p.morning),pm=sessionMinutes(p.afternoon),total=am+pm,b1=Math.min(540,am/max*540),b2=Math.min(540-b1,pm/max*540);out.push('<text x="'+x+'" y="'+(ry+28)+'" class="f" font-size="17" font-weight="750" fill="#163454">'+esc(short)+'</text>','<rect x="250" y="'+(ry+13)+'" width="540" height="22" rx="11" fill="#E7EEF5"/>',b1?'<rect x="250" y="'+(ry+13)+'" width="'+b1.toFixed(1)+'" height="22" rx="11" fill="url(#blue)"/>':"",b2?'<rect x="'+(250+b1).toFixed(1)+'" y="'+(ry+13)+'" width="'+b2.toFixed(1)+'" height="22" rx="11" fill="url(#green)"/>':"",' <text x="815" y="'+(ry+31)+'" class="f" font-size="18" font-weight="850" fill="#052E63">'+esc(total?fmtMinutes(total):"—")+'</text>');}});
if(slot==="daily_2105")out.push('<circle cx="910" cy="835" r="7" fill="#2D8CFF"/><text x="925" y="841" class="small">Ca sáng</text><circle cx="1000" cy="835" r="7" fill="#19A660"/><text x="1015" y="841" class="small">Ca chiều</text>');
return out.join("");}
function overview(report){const t=totals(report),slot=report.slot,title=slot==="morning_1230"?"CHẤM CÔNG — CA SÁNG":"CHẤM CÔNG — CẢ NGÀY";const k3=slot==="morning_1230"?{label:"Chưa chấm công",value:String(t.review),accent:C.red,detail:"cần kiểm tra"}:{label:"Tổng giờ công",value:fmtMinutes(t.minutes),accent:C.gold,detail:"đã xác nhận"};return [
  defs(OVERVIEW_CANVAS.width,OVERVIEW_CANVAS.height),officeHero(),heroText(title,report.date),
  kpi(40,285,490,"Tổng nhân sự",String(t.total),C.navy,"roster xác nhận"),
  kpi(550,285,490,"Đã chấm công",t.recorded+"/"+t.total,C.green,slot==="morning_1230"?"ca sáng":"cả ngày"),
  kpi(40,437,490,k3.label,k3.value,k3.accent,k3.detail),
  kpi(550,437,490,"Tỷ lệ chấm công",t.rate+"%",C.blue,"đối soát"),
  '<g filter="url(#shadow)"><rect x="40" y="600" width="1000" height="170" rx="24" fill="#FFFFFF" stroke="#DCE7F0"/></g>',
  donut(160,685,58,t.rate),
  '<text x="270" y="648" class="f" font-size="25" font-weight="850" fill="#052E63">TỔNG QUAN</text>',
  '<circle cx="285" cy="690" r="8" fill="#19A660"/><text x="305" y="697" class="f" font-size="20" font-weight="700" fill="#163454">Đã ghi nhận: '+t.recorded+'/'+t.total+'</text>',
  '<circle cx="285" cy="730" r="8" fill="'+(t.review?C.red:"#B5C3CF")+'"/><text x="305" y="737" class="f" font-size="20" font-weight="700" fill="#163454">Cần đối soát: '+t.review+'</text>',
  '<rect x="650" y="630" width="345" height="95" rx="18" fill="'+(t.review?"#FFF4E2":"#EDF9F2")+'"/>',
  '<text x="675" y="667" class="f" font-size="18" font-weight="800" fill="'+(t.review?"#9A6800":"#0F7844")+'">'+(t.review?"CẦN LƯU Ý":"TRẠNG THÁI")+'</text>',
  '<text x="675" y="704" class="f" font-size="20" font-weight="750" fill="#163454">'+esc(t.review?"Có "+t.review+" nhân sự cần kiểm tra.":"Dữ liệu đã ghi nhận đầy đủ.")+'</text>',
  overviewBars(report),
  '<rect x="0" y="1285" width="1080" height="65" fill="url(#navy)"/><text x="55" y="1325" class="f" font-size="15" font-weight="650" fill="#E5EFF8">Số liệu phục vụ đối soát; sai lệch vui lòng phản hồi P.HC-NS.</text>',
  '</svg>'
].join("");}
function statusBadge(x,y,row,slot){const s=status(row,slot),c=tone(s.tone);return '<rect x="'+x+'" y="'+y+'" width="190" height="40" rx="20" fill="'+c.bg+'"/><circle cx="'+(x+21)+'" cy="'+(y+20)+'" r="8" fill="'+c.dot+'"/><text x="'+(x+39)+'" y="'+(y+27)+'" class="f" font-size="16" font-weight="800" fill="'+c.fg+'">'+esc(s.text)+'</text>';}
function morningCard(row,i,y){const m=row?.morning||{},mins=confirmedMinutes(row,"morning_1230"),bar=mins==null?0:Math.min(1,mins/300)*910;return [
  '<g filter="url(#shadow)"><rect x="40" y="'+y+'" width="1000" height="152" rx="22" fill="#FFFFFF" stroke="#DCE7F0"/></g>',
  '<circle cx="78" cy="'+(y+38)+'" r="22" fill="#EAF4FF"/><text x="78" y="'+(y+46)+'" text-anchor="middle" class="f" font-size="19" font-weight="900" fill="#1D73C8">'+(i+1)+'</text>',
  '<text x="115" y="'+(y+47)+'" class="name">'+esc(row.name)+'</text>',statusBadge(820,y+18,row,"morning_1230"),
  '<text x="115" y="'+(y+88)+'" class="small">Giờ vào</text><text x="235" y="'+(y+90)+'" class="value">'+esc(m.in||"—")+'</text>',
  '<text x="385" y="'+(y+88)+'" class="small">Giờ ra</text><text x="495" y="'+(y+90)+'" class="value">'+esc(m.out||"—")+'</text>',
  '<text x="640" y="'+(y+88)+'" class="small">Công sáng</text><text x="780" y="'+(y+90)+'" class="value">'+esc(mins==null?"—":fmtMinutes(mins))+'</text>',
  '<rect x="115" y="'+(y+116)+'" width="910" height="16" rx="8" fill="#E7EEF5"/>',bar?'<rect x="115" y="'+(y+116)+'" width="'+bar.toFixed(1)+'" height="16" rx="8" fill="url(#blue)"/>':""
].join("");}
function dailyCard(row,i,y){const p=splitSessions(row),am=sessionMinutes(p.morning),pm=sessionMinutes(p.afternoon);return [
  '<g filter="url(#shadow)"><rect x="40" y="'+y+'" width="1000" height="148" rx="22" fill="#FFFFFF" stroke="#DCE7F0"/></g>',
  '<circle cx="78" cy="'+(y+38)+'" r="22" fill="#EAF4FF"/><text x="78" y="'+(y+46)+'" text-anchor="middle" class="f" font-size="19" font-weight="900" fill="#1D73C8">'+(i+1)+'</text>',
  '<text x="115" y="'+(y+47)+'" class="name">'+esc(row.name)+'</text>',statusBadge(820,y+18,row,"daily_2105"),
  '<rect x="80" y="'+(y+70)+'" width="390" height="72" rx="16" fill="#EAF4FF"/><text x="100" y="'+(y+96)+'" class="f" font-size="16" font-weight="850" fill="#0B5AA3">CA SÁNG</text><text x="100" y="'+(y+125)+'" class="f" font-size="19" font-weight="750" fill="#163454">'+esc(sessionTime(p.morning))+'</text><text x="445" y="'+(y+125)+'" text-anchor="end" class="f" font-size="19" font-weight="900" fill="#0B5AA3">'+esc(am?fmtMinutes(am):"—")+'</text>',
  '<rect x="490" y="'+(y+70)+'" width="390" height="72" rx="16" fill="#EAF8F0"/><text x="510" y="'+(y+96)+'" class="f" font-size="16" font-weight="850" fill="#0A7541">CA CHIỀU</text><text x="510" y="'+(y+125)+'" class="f" font-size="19" font-weight="750" fill="#163454">'+esc(sessionTime(p.afternoon))+'</text><text x="855" y="'+(y+125)+'" text-anchor="end" class="f" font-size="19" font-weight="900" fill="#0A7541">'+esc(pm?fmtMinutes(pm):"—")+'</text>',
  '<rect x="895" y="'+(y+78)+'" width="110" height="56" rx="16" fill="#FFF6E2"/><text x="950" y="'+(y+100)+'" text-anchor="middle" class="f" font-size="13" font-weight="800" fill="#9A6800">TỔNG</text><text x="950" y="'+(y+127)+'" text-anchor="middle" class="f" font-size="23" font-weight="900" fill="#052E63">'+esc(row.total_display||"—")+'</text>'
].join("");}
function detail(report){const slot=report.slot,title=slot==="morning_1230"?"CHI TIẾT CHẤM CÔNG — CA SÁNG":"CHI TIẾT CHẤM CÔNG — CẢ NGÀY";const out=[defs(DETAIL_CANVAS.width,DETAIL_CANVAS.height),officeHero(),heroText(title,report.date),'<text x="45" y="300" class="f" font-size="21" font-weight="850" fill="#052E63">CHI TIẾT 8 NHÂN SỰ</text>'];const start=330,step=slot==="morning_1230"?152:151;report.employees.forEach((row,i)=>out.push(slot==="morning_1230"?morningCard(row,i,start+i*step):dailyCard(row,i,start+i*step)));out.push('<rect x="0" y="1550" width="1080" height="70" fill="url(#navy)"/><text x="55" y="1580" class="f" font-size="15" font-weight="650" fill="#FFFFFF">Lưu ý: Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức.</text><text x="55" y="1605" class="f" font-size="14" font-weight="600" fill="#DCEAF6">Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh.</text>','</svg>');return out.join("");}

export function buildAttendanceReportSvgs(report){
  if(!report||report.kind!=="attendance_business_report")throw new Error("Invalid attendance business report");
  if(!["morning_1230","daily_2105"].includes(report.slot))throw new Error("Unsupported attendance slot");
  if(!Array.isArray(report.employees)||report.employees.length!==8)throw new Error("Approved image layout requires exactly 8 employees");
  return {overview:overview(report),detail:detail(report)};
}
