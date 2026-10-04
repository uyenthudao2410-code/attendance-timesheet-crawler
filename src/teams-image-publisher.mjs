const DAY_NAMES=["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
export const TEAMS_HOSTED_CONTENT_LIMIT=4*1024*1024;
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");}
export function formatVietnameseDate(iso){const m=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)throw new Error("Invalid report date");const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return `${DAY_NAMES[d.getUTCDay()]}, ${m[3]}/${m[2]}/${m[1]}`;}
function slotLabel(slot){if(slot==="morning_1230")return"CA SÁNG";if(slot==="daily_2105")return"CẢ NGÀY";throw new Error("Unsupported attendance slot");}
export function buildTeamsHostedImagePayload({report,imageBase64,mode="PRODUCTION"}){
  if(!report||report.kind!=="attendance_business_report")throw new Error("Invalid attendance business report");
  if(!String(imageBase64||"").trim())throw new Error("V5 Teams delivery requires one locked-template image");
  const normalized=String(mode||"PRODUCTION").trim().toUpperCase();
  if(!["TEST","PRODUCTION"].includes(normalized))throw new Error("Unsupported Teams delivery mode");
  const label=slotLabel(report.slot),prefix=normalized==="TEST"?"[TEST] ":"",date=formatVietnameseDate(report.date);
  const s=report.summary&&typeof report.summary==="object"?report.summary:null;
  const summaryLines=[];
  if(s){
    if(report.slot==="morning_1230"){
      summaryLines.push(
        `<br><b>📊 Tình hình ca sáng:</b> ${esc(s.recorded_count)}/${esc(s.total_employees)} nhân sự đã ghi nhận • Tỷ lệ ${esc(s.attendance_rate)}% • Tổng thời lượng ${esc(s.total_hours_text)}.`
      );
      if(Number(s.attention_count)>0) summaryLines.push(
        `<br><b>⚠️ Cần kiểm tra:</b> ${esc(s.attention_count)} trường hợp chưa có bản ghi/cần đối soát.`
      );
      summaryLines.push("<br>Chi tiết giờ vào, giờ ra, thời lượng và trạng thái từng nhân sự được thể hiện trong báo cáo bên dưới.");
    }else{
      summaryLines.push(
        `<br><b>📊 Tổng hợp ngày:</b> ${esc(s.with_record_count)}/${esc(s.total_employees)} nhân sự có dữ liệu • ${esc(s.recorded_count)} đã chốt • Tổng giờ xác nhận ${esc(s.total_hours_text)}.`
      );
      if(Number(s.attention_count)>0) summaryLines.push(
        `<br><b>⚠️ Cần kiểm tra:</b> ${esc(s.attention_count)} trường hợp chưa có bản ghi/chưa chốt/cần đối soát.`
      );
      summaryLines.push("<br>Chi tiết ca sáng, ca chiều, tổng công và trạng thái từng nhân sự được thể hiện trong báo cáo bên dưới.");
    }
  }else{
    summaryLines.push("<br>Tổng hợp từ hệ thống chấm công để đối soát.");
  }
  return{
    body:{contentType:"html",content:[
      `<b>${prefix}BÁO CÁO CHẤM CÔNG — ${label}</b>`,
      `<br><b>📅 ${esc(date)}</b>`,
      ...summaryLines,
      "<br><br>",
      `<img src="../hostedContents/1/\$value" width="900" alt="Báo cáo chấm công ${esc(report.date)}">`,
      "<br><br><i>Số liệu phục vụ đối soát nội bộ; sai lệch vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh.</i>"
    ].join("")},
    hostedContents:[{"@microsoft.graph.temporaryId":"1",contentBytes:String(imageBase64),contentType:"image/png"}]
  };
}
