import crypto from "node:crypto";
import { readFileSync } from "node:fs";

export const APPROVED_LAYOUT_VERSION="ATTENDANCE_IMAGE_V5_LOCKED_MASTER_2026_10_02";
export const CANVAS=Object.freeze({width:1080,height:1440});
export const MASTER_TEMPLATE_IDS=Object.freeze({
  morning_1230:"ATTENDANCE_V5_LOCKED_MORNING_2026_10_02",
  daily_2105:"ATTENDANCE_V5_LOCKED_DAILY_2026_10_02",
});
export const MASTER_TEMPLATE_BLOB_SHAS=Object.freeze({
  morning_1230:"c706e8e58c423e8bf75859eb41a98f73cbc3a805",
  daily_2105:"804745bc93d429f0d2e94dd8a3f85406e69fb385",
});

const MIDDAY=12*60+45;
const TEMPLATE_URLS=Object.freeze({
  morning_1230:new URL("../assets/attendance-v5/morning-master.svg",import.meta.url),
  daily_2105:new URL("../assets/attendance-v5/daily-master.svg",import.meta.url),
});

function gitBlobSha(content){
  const bytes=Buffer.from(content,"utf8");
  return crypto.createHash("sha1").update(Buffer.concat([
    Buffer.from("blob "+bytes.length+"\0","utf8"),
    bytes,
  ])).digest("hex");
}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");}
function fmtMinutes(m){if(!Number.isInteger(m)||m<0)return"—";return Math.floor(m/60)+"h"+String(m%60).padStart(2,"0");}
function dateInfo(iso){
  const m=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)throw new Error("Invalid report date");
  const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
  const n=["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
  return{label:n[d.getUTCDay()]+", "+m[3]+"/"+m[2]+"/"+m[1],weekday:n[d.getUTCDay()].toUpperCase(),day:m[3],month:m[2],year:m[1]};
}
function minuteOfDay(v){const m=String(v||"").match(/^([01]\d|2[0-3]):([0-5]\d)$/);return m?+m[1]*60 + +m[2]:null;}
function splitSessions(row){
  const out={morning:[],afternoon:[]};
  for(const s of Array.isArray(row?.sessions)?row.sessions:[]){
    const a=minuteOfDay(s?.in||s?.out);
    if(a==null)continue;
    (a<MIDDAY?out.morning:out.afternoon).push(s);
  }
  return out;
}
function sessionMinutes(list){return(list||[]).reduce((sum,s)=>sum+(Number.isInteger(s?.minutes)?s.minutes:0),0);}
function sessionTime(list){if(!Array.isArray(list)||!list.length)return"—";return list.map(s=>(s?.in||"—")+"–"+(s?.out||"—")).join("; ");}
function confirmedMinutes(row,slot){return slot==="morning_1230"?(Number.isInteger(row?.morning?.minutes)?row.morning.minutes:null):(Number.isInteger(row?.total_minutes)?row.total_minutes:null);}
function status(row,slot){
  const code=String(row?.status_code||"");
  if(slot==="morning_1230"){
    if(code==="recorded")return{text:"Đã chấm công",tone:"ok"};
    if(code==="working")return{text:"Đang làm việc",tone:"ok"};
    if(code==="not_recorded_morning")return{text:"Chưa chấm công",tone:"bad"};
  }else{
    if(code==="recorded")return{text:"Đã ghi nhận",tone:"ok"};
    if(code==="not_recorded")return{text:"Chưa chấm công",tone:"bad"};
    if(code==="open_session")return{text:"Chưa chốt",tone:"warn"};
  }
  if(code==="technical_error")return{text:"Lỗi nguồn",tone:"bad"};
  return{text:"Cần đối soát",tone:"warn"};
}
function tone(t){
  return t==="ok"?{bg:"#EAF8EF",fg:"#108347",dot:"#16A34A"}:
    t==="bad"?{bg:"#FFF0F1",fg:"#D32835",dot:"#EF3340"}:
    {bg:"#FFF6DF",fg:"#9A6800",dot:"#C58A22"};
}
function totals(report){
  const slot=report.slot,rows=report.employees;
  const recorded=rows.filter(r=>slot==="morning_1230"?["recorded","working"].includes(String(r?.status_code||"")):String(r?.status_code||"")==="recorded").length;
  const minutes=rows.reduce((s,r)=>s+(confirmedMinutes(r,slot)||0),0);
  return{total:rows.length,recorded,review:rows.length-recorded,rate:Math.round(recorded*100/Math.max(1,rows.length)),minutes};
}
function shortName(name){const p=String(name||"").trim().split(/\s+/);return p[p.length-1]||"";}
function templateFor(slot){
  const template=readFileSync(TEMPLATE_URLS[slot],"utf8");
  const expectedId=MASTER_TEMPLATE_IDS[slot];
  if(!template.includes("MASTER_TEMPLATE_VERSION: "+expectedId))throw new Error("Master template id mismatch");
  const actualSha=gitBlobSha(template);
  if(actualSha!==MASTER_TEMPLATE_BLOB_SHAS[slot])throw new Error("Locked master template fingerprint mismatch");
  return template;
}
function replaceAllTokens(template,map){
  let out=template;
  for(const [key,value] of Object.entries(map)){
    out=out.split("{{"+key+"}}").join(String(value));
  }
  const unresolved=out.match(/\{\{[A-Z0-9_]+\}\}/g);
  if(unresolved)throw new Error("Unresolved master-template placeholders: "+[...new Set(unresolved)].join(", "));
  return out;
}
function commonMap(report){
  const d=dateInfo(report.date),t=totals(report),circ=2*Math.PI*51,good=circ*t.rate/100;
  return{
    DATE_LABEL:esc(d.label),DAY:esc(d.day),MONTH:esc(d.month),YEAR:esc(d.year),WEEKDAY:esc(d.weekday),
    KPI_TOTAL:esc(t.total),KPI_RECORDED:esc(t.recorded),KPI_RATE:esc(t.rate+"%"),
    SUMMARY_RECORDED:esc(t.recorded),SUMMARY_REVIEW:esc(t.review),
    REVIEW_DOT:t.review?"#EF3340":"#B9C5D0",
    SUMMARY_BG:t.review?"#FFF4DF":"#EFF9F3",
    SUMMARY_ACCENT:t.review?"#9A6800":"#0D7541",
    SUMMARY_TITLE:t.review?"CẦN LƯU Ý":"TRẠNG THÁI",
    SUMMARY_TEXT:esc(t.review?"Có "+t.review+" nhân sự cần kiểm tra.":"Dữ liệu đã ghi nhận đầy đủ."),
    DONUT_DASH:good.toFixed(1)+" "+(circ-good).toFixed(1),
  };
}
function addChartMap(map,report){
  const slot=report.slot,base=690,max=slot==="morning_1230"?300:600,chartH=160;
  report.employees.forEach((row,index)=>{
    const i=index+1;
    map["BAR"+i+"_NAME"]=esc(shortName(row.name));
    if(slot==="morning_1230"){
      const m=confirmedMinutes(row,slot),h=m==null?0:Math.min(1,m/max)*chartH,y=base-h;
      map["BAR"+i+"_Y"]=y.toFixed(1);
      map["BAR"+i+"_H"]=h.toFixed(1);
      map["BAR"+i+"_LABEL"]=esc(m==null?"—":fmtMinutes(m));
      map["BAR"+i+"_LABEL_Y"]=Math.max(518,y-7).toFixed(1);
    }else{
      const p=splitSessions(row),am=sessionMinutes(p.morning),pm=sessionMinutes(p.afternoon),total=am+pm;
      const totalH=total?Math.min(1,total/max)*chartH:0;
      const amH=total?totalH*(am/total):0,pmH=total?totalH*(pm/total):0;
      const amY=base-amH,pmY=base-amH-pmH;
      map["BAR"+i+"_AM_Y"]=amY.toFixed(1);
      map["BAR"+i+"_AM_H"]=amH.toFixed(1);
      map["BAR"+i+"_PM_Y"]=pmY.toFixed(1);
      map["BAR"+i+"_PM_H"]=pmH.toFixed(1);
      map["BAR"+i+"_LABEL"]=esc(total?fmtMinutes(total):"—");
      map["BAR"+i+"_LABEL_Y"]=Math.max(518,(total?pmY:base)-7).toFixed(1);
    }
  });
}
function addMorningRows(map,report){
  report.employees.forEach((row,index)=>{
    const i=index+1,s=status(row,"morning_1230"),c=tone(s.tone),m=row?.morning||{},mins=confirmedMinutes(row,"morning_1230");
    const pct=mins==null?0:Math.max(0,Math.min(100,Math.round(mins/240*100)));
    Object.assign(map,{
      ["ROW"+i+"_NAME"]:esc(row.name),
      ["ROW"+i+"_STATUS"]:esc(s.text),
      ["ROW"+i+"_STATUS_BG"]:c.bg,
      ["ROW"+i+"_STATUS_DOT"]:c.dot,
      ["ROW"+i+"_STATUS_FG"]:c.fg,
      ["ROW"+i+"_IN"]:esc(m.in||"—"),
      ["ROW"+i+"_OUT"]:esc(m.out||"—"),
      ["ROW"+i+"_DURATION"]:esc(mins==null?"—":fmtMinutes(mins)),
      ["ROW"+i+"_WORK_BAR"]:(190*pct/100).toFixed(1),
      ["ROW"+i+"_WORK_PCT"]:esc(pct+"%"),
    });
  });
}
function addDailyRows(map,report){
  report.employees.forEach((row,index)=>{
    const i=index+1,p=splitSessions(row),am=sessionMinutes(p.morning),pm=sessionMinutes(p.afternoon),s=status(row,"daily_2105"),c=tone(s.tone);
    Object.assign(map,{
      ["ROW"+i+"_NAME"]:esc(row.name),
      ["ROW"+i+"_AM_TIME"]:esc(sessionTime(p.morning)),
      ["ROW"+i+"_AM_DURATION"]:esc(am?fmtMinutes(am):"—"),
      ["ROW"+i+"_PM_TIME"]:esc(sessionTime(p.afternoon)),
      ["ROW"+i+"_PM_DURATION"]:esc(pm?fmtMinutes(pm):"—"),
      ["ROW"+i+"_TOTAL"]:esc(row.total_display||"—"),
      ["ROW"+i+"_STATUS"]:esc(s.text),
      ["ROW"+i+"_STATUS_BG"]:c.bg,
      ["ROW"+i+"_STATUS_DOT"]:c.dot,
      ["ROW"+i+"_STATUS_FG"]:c.fg,
    });
  });
}

export function getMasterTemplateFingerprint(slot){
  const template=templateFor(slot);
  return{template_id:MASTER_TEMPLATE_IDS[slot],git_blob_sha:gitBlobSha(template)};
}

export function buildAttendanceReportSvg(report){
  if(!report||report.kind!=="attendance_business_report")throw new Error("Invalid attendance business report");
  if(!["morning_1230","daily_2105"].includes(report.slot))throw new Error("Unsupported attendance slot");
  if(!Array.isArray(report.employees)||report.employees.length!==8)throw new Error("Approved image layout requires exactly 8 employees");

  const map=commonMap(report),t=totals(report);
  addChartMap(map,report);
  if(report.slot==="morning_1230"){
    map.KPI_THIRD=esc(t.review);
    map.KPI_THIRD_DETAIL=esc(t.review?"cần kiểm tra":"đầy đủ");
    map.SUMMARY_SUB="Vui lòng kiểm tra và đối soát.";
    addMorningRows(map,report);
  }else{
    map.KPI_THIRD=esc(fmtMinutes(t.minutes));
    map.KPI_THIRD_DETAIL="đã xác nhận";
    map.SUMMARY_SUB=esc("Tổng giờ công: "+fmtMinutes(t.minutes));
    addDailyRows(map,report);
  }
  return replaceAllTokens(templateFor(report.slot),map);
}
