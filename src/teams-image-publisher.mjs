const DAY_NAMES=["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
export const TEAMS_HOSTED_CONTENT_LIMIT=4*1024*1024;

function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");}
export function formatVietnameseDate(iso){
  const m=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)throw new Error("Invalid report date");
  const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
  return `${DAY_NAMES[d.getUTCDay()]}, ${m[3]}/${m[2]}/${m[1]}`;
}
function slotLabel(slot){if(slot==="morning_1230")return"CA SÁNG";if(slot==="daily_2105")return"CẢ NGÀY";throw new Error("Unsupported attendance slot");}

export function buildTeamsHostedImagePayload({report,imageBase64s,mode="PRODUCTION"}){
  if(!report||report.kind!=="attendance_business_report")throw new Error("Invalid attendance business report");
  if(!Array.isArray(imageBase64s)||imageBase64s.length!==2||imageBase64s.some(v=>!String(v||"").trim()))throw new Error("V3 Teams delivery requires exactly two images");
  const normalized=String(mode||"PRODUCTION").trim().toUpperCase();
  if(!["TEST","PRODUCTION"].includes(normalized))throw new Error("Unsupported Teams delivery mode");
  const label=slotLabel(report.slot),prefix=normalized==="TEST"?"[TEST] ":"",date=formatVietnameseDate(report.date);
  const body=[
    `<b>${prefix}BÁO CÁO CHẤM CÔNG — ${label}</b>`,
    `<br><b>${esc(date)}</b>`,
    "<br>Tổng hợp từ hệ thống chấm công để đối soát.",
    "<br><br>",
    `<img src="../hostedContents/1/\$value" width="900" alt="Tổng quan chấm công ${esc(report.date)}">`,
    "<br><br>",
    `<img src="../hostedContents/2/\$value" width="900" alt="Chi tiết chấm công ${esc(report.date)}">`
  ].join("");
  return{
    body:{contentType:"html",content:body},
    hostedContents:imageBase64s.map((contentBytes,index)=>({
      "@microsoft.graph.temporaryId":String(index+1),
      contentBytes:String(contentBytes),
      contentType:"image/png",
    }))
  };
}
