export const APPROVED_LAYOUT_VERSION="ATTENDANCE_IMAGE_V4_MOCKUP_FIDELITY_2026_10_02";
export const CANVAS=Object.freeze({width:1080,height:1440});

const MIDDAY=12*60+45;
const C=Object.freeze({
  navy:"#062E62",navyDark:"#021D42",blue:"#2388F2",blueSoft:"#EAF4FF",
  green:"#16A34A",greenSoft:"#EAF8EF",gold:"#C58A22",goldSoft:"#FFF6E2",
  red:"#EF3340",paper:"#F7FBFF",ink:"#17365F",muted:"#617891",line:"#DCE7F0"
});

function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");}
function fmtMinutes(m){if(!Number.isInteger(m)||m<0)return"—";return Math.floor(m/60)+"h"+String(m%60).padStart(2,"0");}
function dateInfo(iso){const m=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)throw new Error("Invalid report date");const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));const n=["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];return{label:n[d.getUTCDay()]+", "+m[3]+"/"+m[2]+"/"+m[1],weekday:n[d.getUTCDay()].toUpperCase(),day:m[3],month:m[2],year:m[1]};}
function minuteOfDay(v){const m=String(v||"").match(/^([01]\d|2[0-3]):([0-5]\d)$/);return m?+m[1]*60 + +m[2]:null;}
function splitSessions(row){const out={morning:[],afternoon:[]};for(const s of Array.isArray(row?.sessions)?row.sessions:[]){const a=minuteOfDay(s?.in||s?.out);if(a==null)continue;(a<MIDDAY?out.morning:out.afternoon).push(s);}return out;}
function sessionMinutes(list){return (list||[]).reduce((sum,s)=>sum+(Number.isInteger(s?.minutes)?s.minutes:0),0);}
function sessionTime(list){if(!Array.isArray(list)||!list.length)return"—";return list.map(s=>(s?.in||"—")+"–"+(s?.out||"—")).join("; ");}
function confirmedMinutes(row,slot){return slot==="morning_1230"?(Number.isInteger(row?.morning?.minutes)?row.morning.minutes:null):(Number.isInteger(row?.total_minutes)?row.total_minutes:null);}
function status(row,slot){const code=String(row?.status_code||"");if(slot==="morning_1230"){if(code==="recorded")return{text:"Đã chấm công",tone:"ok"};if(code==="working")return{text:"Đang làm việc",tone:"ok"};if(code==="not_recorded_morning")return{text:"Chưa chấm công",tone:"bad"};}else{if(code==="recorded")return{text:"Đã ghi nhận",tone:"ok"};if(code==="not_recorded")return{text:"Chưa chấm công",tone:"bad"};if(code==="open_session")return{text:"Chưa chốt",tone:"warn"};}if(code==="technical_error")return{text:"Lỗi nguồn",tone:"bad"};return{text:"Cần đối soát",tone:"warn"};}
function tone(t){return t==="ok"?{bg:"#EAF8EF",fg:"#108347",dot:C.green}:t==="bad"?{bg:"#FFF0F1",fg:"#D32835",dot:C.red}:{bg:"#FFF6DF",fg:"#9A6800",dot:C.gold};}
function totals(report){const slot=report.slot,rows=report.employees;const recorded=rows.filter(r=>slot==="morning_1230"?["recorded","working"].includes(String(r?.status_code||"")):String(r?.status_code||"")==="recorded").length;const minutes=rows.reduce((s,r)=>s+(confirmedMinutes(r,slot)||0),0);return{total:rows.length,recorded,review:rows.length-recorded,rate:Math.round(recorded*100/Math.max(1,rows.length)),minutes};}
function initials(name){const p=String(name||"").trim().split(/\s+/);return(p[p.length-1]||"?").slice(0,1).toUpperCase();}

function defs(){return[
'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">',
'<defs>',
'<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".58" stop-color="#F8FCFF"/><stop offset="1" stop-color="#E9F5FD"/></linearGradient>',
'<linearGradient id="navy" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#031F47"/><stop offset="1" stop-color="#0B548E"/></linearGradient>',
'<linearGradient id="blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2D95FF"/><stop offset="1" stop-color="#166ED0"/></linearGradient>',
'<linearGradient id="green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4EC77E"/><stop offset="1" stop-color="#118948"/></linearGradient>',
'<linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B7760E"/><stop offset="1" stop-color="#E1AE3C"/></linearGradient>',
'<filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#0B365B" flood-opacity=".10"/></filter>',
'<style>.f{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif}.ey{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:20px;font-weight:900;letter-spacing:1.1px;fill:#B5740F}.title{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:45px;font-weight:900;fill:#062E62}.date{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:23px;font-weight:850;fill:#17365F}.sub{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:16px;font-weight:650;fill:#617891}.klabel{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:14px;font-weight:800;fill:#617891}.kvalue{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:31px;font-weight:900;fill:#062E62}.section{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:19px;font-weight:900;fill:#062E62}.th{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:12.5px;font-weight:900;fill:#FFFFFF}.td{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:13.8px;font-weight:650;fill:#17365F}.name{font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif;font-size:14px;font-weight:800;fill:#17365F}</style>',
'</defs>',
'<rect width="1080" height="1440" fill="#F7FBFF"/>'
].join("");}

function officeScene(slot){
  if(slot==="morning_1230")return[
    '<rect x="0" y="0" width="1080" height="250" fill="url(#paper)"/>',
    '<rect x="650" y="0" width="430" height="250" fill="#EEF7FC"/>',
    '<g opacity=".95"><rect x="690" y="24" width="142" height="168" fill="#D9ECF8"/><rect x="845" y="12" width="118" height="180" fill="#EAF4FA"/><line x1="725" y1="24" x2="725" y2="192" stroke="#A9C6DA" stroke-width="2"/><line x1="770" y1="24" x2="770" y2="192" stroke="#A9C6DA" stroke-width="2"/><line x1="845" y1="58" x2="963" y2="58" stroke="#BBD0E0" stroke-width="2"/><line x1="845" y1="108" x2="963" y2="108" stroke="#BBD0E0" stroke-width="2"/></g>',
    '<rect x="670" y="194" width="305" height="18" rx="9" fill="#C99A57"/><rect x="704" y="210" width="12" height="40" fill="#8B6334"/><rect x="930" y="210" width="12" height="40" fill="#8B6334"/>',
    '<rect x="752" y="159" width="78" height="42" rx="4" fill="#2C4058"/><rect x="760" y="166" width="62" height="29" fill="#A6C9E3"/>',
    '<path d="M865 196 C852 152 874 122 905 110 C895 147 899 174 918 196 Z" fill="#3E926E"/><path d="M901 196 C913 151 941 137 970 138 C950 163 940 182 940 196 Z" fill="#64A983"/><rect x="887" y="193" width="56" height="23" rx="6" fill="#D8E5ED"/>',
    '<circle cx="620" cy="53" r="33" fill="#FFFFFF" stroke="#17365F" stroke-width="3"/><line x1="620" y1="53" x2="620" y2="33" stroke="#17365F" stroke-width="3"/><line x1="620" y1="53" x2="639" y2="62" stroke="#17365F" stroke-width="3"/>',
    '<path d="M985 0 L1080 0 L1080 250 L1040 250 L1068 209 L1026 209 L1072 133 Z" fill="#062E62"/><path d="M948 0 L986 0 L1073 116 L1048 143 Z" fill="#C58A22" opacity=".78"/>'
  ].join("");
  return[
    '<rect x="0" y="0" width="1080" height="250" fill="url(#paper)"/>',
    '<g opacity=".96"><rect x="645" y="105" width="58" height="118" fill="#B8D5E8"/><rect x="712" y="74" width="72" height="149" fill="#9FC4DD"/><rect x="796" y="34" width="92" height="189" fill="#7DAFCC"/><rect x="900" y="89" width="52" height="134" fill="#BBD8E9"/><rect x="962" y="52" width="78" height="171" fill="#94BDD6"/></g>',
    '<g opacity=".5" stroke="#E8F3FA"><line x1="816" y1="34" x2="816" y2="223"/><line x1="838" y1="34" x2="838" y2="223"/><line x1="860" y1="34" x2="860" y2="223"/><line x1="796" y1="78" x2="888" y2="78"/><line x1="796" y1="122" x2="888" y2="122"/><line x1="796" y1="166" x2="888" y2="166"/></g>',
    '<path d="M985 0 L1080 0 L1080 250 L1040 250 L1068 209 L1026 209 L1072 133 Z" fill="#062E62"/><path d="M948 0 L986 0 L1073 116 L1048 143 Z" fill="#C58A22" opacity=".78"/>'
  ].join("");
}

function header(report){
  const d=dateInfo(report.date),title=report.slot==="morning_1230"?"CHẤM CÔNG — CA SÁNG":"CHẤM CÔNG — CẢ NGÀY";
  return[
    officeScene(report.slot),
    '<rect x="34" y="29" width="66" height="6" rx="3" fill="url(#gold)"/>',
    '<text x="34" y="69" class="ey">BÁO CÁO</text>',
    '<text x="34" y="122" class="title">'+esc(title)+'</text>',
    '<text x="34" y="161" class="date">'+esc(d.label)+'</text>',
    '<text x="34" y="193" class="sub">Tổng hợp từ hệ thống chấm công để đối soát.</text>',
    '<g filter="url(#shadow)"><rect x="858" y="32" width="158" height="116" rx="16" fill="#FFFFFF" stroke="#DCE7F0"/></g>',
    '<text x="888" y="93" class="f" font-size="43" font-weight="900" fill="#062E62">'+esc(d.day)+'</text>',
    '<text x="947" y="76" class="f" font-size="14" font-weight="800" fill="#617891">Tháng '+esc(d.month)+'</text>',
    '<text x="947" y="99" class="f" font-size="14" font-weight="800" fill="#617891">'+esc(d.year)+'</text>',
    '<rect x="858" y="112" width="158" height="36" rx="0" fill="#F2F7FB"/><text x="937" y="136" text-anchor="middle" class="f" font-size="15" font-weight="850" fill="#17365F">'+esc(d.weekday)+'</text>'
  ].join("");
}

function icon(type,x,y,accent){
  if(type==="people")return'<rect x="'+x+'" y="'+y+'" width="44" height="44" rx="10" fill="'+accent+'" opacity=".13"/><circle cx="'+(x+22)+'" cy="'+(y+16)+'" r="8" fill="'+accent+'"/><path d="M'+(x+9)+' '+(y+36)+' C'+(x+9)+' '+(y+26)+' '+(x+35)+' '+(y+26)+' '+(x+35)+' '+(y+36)+' Z" fill="'+accent+'"/>';
  if(type==="check")return'<rect x="'+x+'" y="'+y+'" width="44" height="44" rx="10" fill="'+accent+'" opacity=".13"/><circle cx="'+(x+22)+'" cy="'+(y+22)+'" r="13" fill="'+accent+'"/><path d="M'+(x+15)+' '+(y+22)+' l5 5 l10 -12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
  if(type==="clock")return'<rect x="'+x+'" y="'+y+'" width="44" height="44" rx="10" fill="'+accent+'" opacity=".13"/><circle cx="'+(x+22)+'" cy="'+(y+22)+'" r="13" fill="none" stroke="'+accent+'" stroke-width="4"/><line x1="'+(x+22)+'" y1="'+(y+22)+'" x2="'+(x+22)+'" y2="'+(y+13)+'" stroke="'+accent+'" stroke-width="3"/><line x1="'+(x+22)+'" y1="'+(y+22)+'" x2="'+(x+30)+'" y2="'+(y+26)+'" stroke="'+accent+'" stroke-width="3"/>';
  return'<rect x="'+x+'" y="'+y+'" width="44" height="44" rx="10" fill="'+accent+'" opacity=".13"/><circle cx="'+(x+22)+'" cy="'+(y+22)+'" r="13" fill="none" stroke="'+accent+'" stroke-width="4"/><text x="'+(x+22)+'" y="'+(y+27)+'" text-anchor="middle" class="f" font-size="14" font-weight="900" fill="'+accent+'">%</text>';
}

function kpi(x,label,value,detail,accent,type){
  return[
    '<g filter="url(#shadow)"><rect x="'+x+'" y="270" width="244" height="132" rx="18" fill="#FFFFFF" stroke="#DCE7F0"/></g>',
    icon(type,x+16,288,accent),
    '<text x="'+(x+72)+'" y="311" class="kvalue">'+esc(value)+'</text>',
    '<text x="'+(x+16)+'" y="350" class="klabel">'+esc(label)+'</text>',
    '<text x="'+(x+16)+'" y="378" class="f" font-size="12.5" font-weight="700" fill="'+accent+'">'+esc(detail)+'</text>'
  ].join("");
}

function donut(cx,cy,r,rate){
  const circ=2*Math.PI*r,good=circ*Math.max(0,Math.min(100,rate))/100;
  return[
    '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="#EEF2F6" stroke-width="18"/>',
    '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="#16A34A" stroke-width="18" stroke-linecap="round" transform="rotate(-90 '+cx+' '+cy+')" stroke-dasharray="'+good.toFixed(1)+' '+(circ-good).toFixed(1)+'"/>',
    '<text x="'+cx+'" y="'+(cy+9)+'" text-anchor="middle" class="f" font-size="30" font-weight="900" fill="#0D7541">'+rate+'%</text>'
  ].join("");
}

function chartBlock(report){
  const slot=report.slot,rows=report.employees,max=slot==="morning_1230"?300:600;
  const left=38,top=430,w=680,h=335,baseY=690,chartTop=505,chartH=160;
  const out=[
    '<g filter="url(#shadow)"><rect x="'+left+'" y="'+top+'" width="'+w+'" height="'+h+'" rx="18" fill="#FFFFFF" stroke="#DCE7F0"/></g>',
    '<text x="60" y="468" class="section">'+(slot==="morning_1230"?"GIỜ CÔNG CA SÁNG THEO NHÂN SỰ":"TỔNG GIỜ CÔNG THEO NHÂN SỰ")+'</text>'
  ];
  for(let i=0;i<=3;i++){const gy=baseY-i*(chartH/3);out.push('<line x1="74" y1="'+gy+'" x2="692" y2="'+gy+'" stroke="#E6EDF4"/><text x="62" y="'+(gy+4)+'" text-anchor="end" class="f" font-size="10.5" fill="#7C90A4">'+Math.round((max/60)*i/3)+'</text>');}
  const startX=93,bw=49,gap=25;
  rows.forEach((row,i)=>{
    const mins=confirmedMinutes(row,slot),ratio=mins==null?0:Math.min(1,mins/max),bh=ratio*chartH,bx=startX+i*(bw+gap),by=baseY-bh;
    out.push('<rect x="'+bx+'" y="'+by.toFixed(1)+'" width="'+bw+'" height="'+bh.toFixed(1)+'" rx="5" fill="'+(slot==="morning_1230"?"url(#blue)":"url(#green)")+'"/>');
    out.push('<text x="'+(bx+bw/2)+'" y="'+Math.max(chartTop+8,by-7).toFixed(1)+'" text-anchor="middle" class="f" font-size="10.5" font-weight="850" fill="#062E62">'+esc(mins==null?"—":fmtMinutes(mins))+'</text>');
    const parts=String(row.name||"").split(" ");const short=parts[parts.length-1]||"";
    out.push('<text x="'+(bx+bw/2)+'" y="716" text-anchor="middle" class="f" font-size="10.5" font-weight="700" fill="#17365F">'+esc(short)+'</text>');
  });
  return out.join("");
}

function summaryBlock(report){
  const t=totals(report),slot=report.slot;
  return[
    '<g filter="url(#shadow)"><rect x="738" y="430" width="304" height="335" rx="18" fill="#FFFFFF" stroke="#DCE7F0"/></g>',
    '<text x="758" y="468" class="section">'+(slot==="morning_1230"?"TỔNG QUAN CA SÁNG":"TỔNG QUAN CẢ NGÀY")+'</text>',
    donut(825,558,51,t.rate),
    '<circle cx="920" cy="524" r="7" fill="#16A34A"/><text x="936" y="529" class="f" font-size="12.5" font-weight="700" fill="#17365F">Đã chấm công</text><text x="1018" y="529" text-anchor="end" class="f" font-size="13" font-weight="900" fill="#062E62">'+t.recorded+'</text>',
    '<circle cx="920" cy="555" r="7" fill="'+(t.review?C.red:"#B9C5D0")+'"/><text x="936" y="560" class="f" font-size="12.5" font-weight="700" fill="#17365F">Chưa chấm công</text><text x="1018" y="560" text-anchor="end" class="f" font-size="13" font-weight="900" fill="#062E62">'+t.review+'</text>',
    '<circle cx="920" cy="586" r="7" fill="#C5D1DC"/><text x="936" y="591" class="f" font-size="12.5" font-weight="700" fill="#17365F">Chưa có dữ liệu</text><text x="1018" y="591" text-anchor="end" class="f" font-size="13" font-weight="900" fill="#062E62">0</text>',
    '<rect x="760" y="635" width="258" height="96" rx="14" fill="'+(t.review?"#FFF4DF":"#EFF9F3")+'"/>',
    '<text x="780" y="666" class="f" font-size="12.5" font-weight="900" fill="'+(t.review?"#9A6800":"#0D7541")+'">'+(t.review?"CẦN LƯU Ý":"TRẠNG THÁI")+'</text>',
    '<text x="780" y="692" class="f" font-size="13" font-weight="700" fill="#17365F">'+esc(t.review?"Có "+t.review+" nhân sự cần kiểm tra.":"Dữ liệu đã ghi nhận đầy đủ.")+'</text>',
    '<text x="780" y="714" class="f" font-size="12" font-weight="650" fill="#617891">'+(slot==="daily_2105"?"Tổng giờ công: "+fmtMinutes(t.minutes):"Vui lòng kiểm tra và đối soát.")+'</text>'
  ].join("");
}

function morningTable(report){
  const x=38,y=790,w=1004,headH=44,rowH=51;
  const widths=[48,220,160,92,92,110,282],headers=["STT","HỌ VÀ TÊN","TRẠNG THÁI","GIỜ VÀO","GIỜ RA","THỜI LƯỢNG","MỨC CÔNG"];
  const out=['<text x="38" y="814" class="section">CHI TIẾT CHẤM CÔNG CA SÁNG</text>','<g filter="url(#shadow)"><rect x="'+x+'" y="832" width="'+w+'" height="'+(headH+rowH*8)+'" rx="16" fill="#FFFFFF" stroke="#DCE7F0"/></g>'];
  let cx=x;headers.forEach((h,i)=>{out.push('<rect x="'+cx+'" y="832" width="'+widths[i]+'" height="'+headH+'" fill="#062E62"/><text x="'+(cx+widths[i]/2)+'" y="860" text-anchor="middle" class="th">'+h+'</text>');cx+=widths[i];});
  report.employees.forEach((row,i)=>{const ry=832+headH+i*rowH,fill=i%2===0?"#FFFFFF":"#F8FBFE",s=status(row,"morning_1230"),tc=tone(s.tone),m=row?.morning||{},mins=confirmedMinutes(row,"morning_1230"),pct=mins==null?0:Math.max(0,Math.min(100,Math.round(mins/240*100))),bar=Math.min(190,pct/100*190);const cell=[x,x+48,x+268,x+428,x+520,x+612,x+722];
    out.push('<rect x="'+x+'" y="'+ry+'" width="'+w+'" height="'+rowH+'" fill="'+fill+'"/><line x1="'+x+'" y1="'+(ry+rowH)+'" x2="'+(x+w)+'" y2="'+(ry+rowH)+'" stroke="#E6EDF4"/>');
    out.push('<text x="'+(cell[0]+24)+'" y="'+(ry+31)+'" text-anchor="middle" class="td">'+(i+1)+'</text><text x="'+(cell[1]+12)+'" y="'+(ry+31)+'" class="name">'+esc(row.name)+'</text>');
    out.push('<rect x="'+(cell[2]+10)+'" y="'+(ry+11)+'" width="140" height="29" rx="15" fill="'+tc.bg+'"/><circle cx="'+(cell[2]+26)+'" cy="'+(ry+25)+'" r="7" fill="'+tc.dot+'"/><text x="'+(cell[2]+40)+'" y="'+(ry+30)+'" class="f" font-size="11.5" font-weight="850" fill="'+tc.fg+'">'+esc(s.text)+'</text>');
    out.push('<text x="'+(cell[3]+46)+'" y="'+(ry+31)+'" text-anchor="middle" class="td">'+esc(m.in||"—")+'</text><text x="'+(cell[4]+46)+'" y="'+(ry+31)+'" text-anchor="middle" class="td">'+esc(m.out||"—")+'</text><text x="'+(cell[5]+55)+'" y="'+(ry+31)+'" text-anchor="middle" class="td">'+esc(mins==null?"—":fmtMinutes(mins))+'</text>');
    out.push('<rect x="'+(cell[6]+15)+'" y="'+(ry+17)+'" width="190" height="15" rx="7" fill="#E3EAF1"/>'+ (bar?'<rect x="'+(cell[6]+15)+'" y="'+(ry+17)+'" width="'+bar.toFixed(1)+'" height="15" rx="7" fill="url(#blue)"/>':"") +'<text x="'+(cell[6]+225)+'" y="'+(ry+30)+'" class="f" font-size="11.5" font-weight="900" fill="#176DCE">'+pct+'%</text>');
  });
  return out.join("");
}

function dailyTable(report){
  const x=38,y=790,w=1004,headH=44,rowH=51;
  const widths=[48,225,190,190,120,231],headers=["STT","HỌ VÀ TÊN","CA SÁNG","CA CHIỀU","TỔNG CÔNG","TRẠNG THÁI"];
  const out=['<text x="38" y="814" class="section">CHI TIẾT CHẤM CÔNG CẢ NGÀY</text>','<g filter="url(#shadow)"><rect x="'+x+'" y="832" width="'+w+'" height="'+(headH+rowH*8)+'" rx="16" fill="#FFFFFF" stroke="#DCE7F0"/></g>'];
  let cx=x;headers.forEach((h,i)=>{const hf=i===2?"#176FC6":i===3?"#11884B":"#062E62";out.push('<rect x="'+cx+'" y="832" width="'+widths[i]+'" height="'+headH+'" fill="'+hf+'"/><text x="'+(cx+widths[i]/2)+'" y="860" text-anchor="middle" class="th">'+h+'</text>');cx+=widths[i];});
  report.employees.forEach((row,i)=>{const ry=832+headH+i*rowH,fill=i%2===0?"#FFFFFF":"#F8FBFE",p=splitSessions(row),am=sessionMinutes(p.morning),pm=sessionMinutes(p.afternoon),s=status(row,"daily_2105"),tc=tone(s.tone),cell=[x,x+48,x+273,x+463,x+653,x+773];
    out.push('<rect x="'+x+'" y="'+ry+'" width="'+w+'" height="'+rowH+'" fill="'+fill+'"/><rect x="'+cell[2]+'" y="'+ry+'" width="190" height="'+rowH+'" fill="#EAF4FF" opacity=".62"/><rect x="'+cell[3]+'" y="'+ry+'" width="190" height="'+rowH+'" fill="#EAF8EF" opacity=".62"/><line x1="'+x+'" y1="'+(ry+rowH)+'" x2="'+(x+w)+'" y2="'+(ry+rowH)+'" stroke="#E6EDF4"/>');
    out.push('<text x="'+(cell[0]+24)+'" y="'+(ry+31)+'" text-anchor="middle" class="td">'+(i+1)+'</text><text x="'+(cell[1]+12)+'" y="'+(ry+31)+'" class="name">'+esc(row.name)+'</text>');
    out.push('<text x="'+(cell[2]+95)+'" y="'+(ry+22)+'" text-anchor="middle" class="f" font-size="11.5" font-weight="800" fill="#0B5AA3">'+esc(sessionTime(p.morning))+'</text><text x="'+(cell[2]+95)+'" y="'+(ry+40)+'" text-anchor="middle" class="f" font-size="12.5" font-weight="900" fill="#0B5AA3">'+esc(am?fmtMinutes(am):"—")+'</text>');
    out.push('<text x="'+(cell[3]+95)+'" y="'+(ry+22)+'" text-anchor="middle" class="f" font-size="11.5" font-weight="800" fill="#0B7541">'+esc(sessionTime(p.afternoon))+'</text><text x="'+(cell[3]+95)+'" y="'+(ry+40)+'" text-anchor="middle" class="f" font-size="12.5" font-weight="900" fill="#0B7541">'+esc(pm?fmtMinutes(pm):"—")+'</text>');
    out.push('<text x="'+(cell[4]+60)+'" y="'+(ry+32)+'" text-anchor="middle" class="f" font-size="15" font-weight="900" fill="#062E62">'+esc(row.total_display||"—")+'</text>');
    out.push('<rect x="'+(cell[5]+12)+'" y="'+(ry+11)+'" width="205" height="29" rx="15" fill="'+tc.bg+'"/><circle cx="'+(cell[5]+28)+'" cy="'+(ry+25)+'" r="7" fill="'+tc.dot+'"/><text x="'+(cell[5]+43)+'" y="'+(ry+30)+'" class="f" font-size="11.5" font-weight="850" fill="'+tc.fg+'">'+esc(s.text)+'</text>');
  });
  return out.join("");
}

function footer(){
  return[
    '<rect x="0" y="1320" width="1080" height="120" fill="url(#navy)"/>',
    '<path d="M0 1320 L155 1320 L70 1440 L0 1440 Z" fill="#D5A13A"/><path d="M935 1440 L1080 1440 L1080 1320 Z" fill="#D5A13A"/>',
    '<circle cx="48" cy="1361" r="19" fill="#D9ECFF"/><text x="48" y="1368" text-anchor="middle" class="f" font-size="21" font-weight="900" fill="#176FC6">i</text>',
    '<text x="82" y="1352" class="f" font-size="13.5" font-weight="850" fill="#FFFFFF">Lưu ý:</text>',
    '<text x="82" y="1377" class="f" font-size="12.5" font-weight="650" fill="#E4EFF8">Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức.</text>',
    '<text x="82" y="1401" class="f" font-size="12.5" font-weight="650" fill="#E4EFF8">Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh.</text>'
  ].join("");
}

function kpis(report){
  const t=totals(report),slot=report.slot;
  const third=slot==="morning_1230"?{label:"Chưa chấm công",value:String(t.review),detail:t.review?"↓ cần kiểm tra":"✓ đầy đủ",accent:C.red,type:"people"}:{label:"Tổng giờ công",value:fmtMinutes(t.minutes),detail:"↑ đã xác nhận",accent:C.gold,type:"clock"};
  return[
    kpi(38,"Tổng nhân sự",String(t.total),"↑ roster xác nhận",C.blue,"people"),
    kpi(296,"Đã chấm công",String(t.recorded),"↑ đối soát",C.green,"check"),
    kpi(554,third.label,third.value,third.detail,third.accent,third.type),
    kpi(812,"Tỷ lệ chấm công",t.rate+"%","↑ tổng quan",C.green,"percent")
  ].join("");
}

export function buildAttendanceReportSvg(report){
  if(!report||report.kind!=="attendance_business_report")throw new Error("Invalid attendance business report");
  if(!["morning_1230","daily_2105"].includes(report.slot))throw new Error("Unsupported attendance slot");
  if(!Array.isArray(report.employees)||report.employees.length!==8)throw new Error("Approved image layout requires exactly 8 employees");
  return[
    defs(),header(report),kpis(report),chartBlock(report),summaryBlock(report),
    report.slot==="morning_1230"?morningTable(report):dailyTable(report),
    footer(),'</svg>'
  ].join("");
}
