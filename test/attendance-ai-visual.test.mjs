import test from "node:test";
import assert from "node:assert/strict";
import { buildAiVisualRequest, validateAiVisualRequest } from "../src/attendance-ai-visual.mjs";

const N=["Điêu Văn Mạnh","Nguyễn Thị Thục Anh","Vũ Đình Tuệ","Bùi Duy Hoàng","Nguyễn Thành Long","Trần Thanh Bình","Lê Thị Phương Linh","Lê Đăng Hiếu"];

function dailyReport(){
  return {
    kind:"attendance_business_report",slot:"daily_2105",date:"2026-10-02",timezone:"Asia/Ho_Chi_Minh",generated_at:"2026-10-03T00:00:00Z",
    employees:N.map((name,index)=>index===7
      ? {name,sessions:[],total_minutes:null,total_display:"—",status_code:"not_recorded"}
      : {name,sessions:[{in:"08:00",out:"12:00",minutes:240},{in:"13:30",out:"18:30",minutes:300}],total_minutes:540,total_display:"9h00",status_code:"recorded"})
  };
}

function morningReport(){
  return {
    kind:"attendance_business_report",slot:"morning_1230",date:"2026-10-03",timezone:"Asia/Ho_Chi_Minh",generated_at:"2026-10-03T05:00:00Z",
    employees:N.map((name,index)=>index===7
      ? {name,morning:null,status_code:"not_recorded_morning"}
      : {name,morning:{in:"08:00",out:"12:00",minutes:240},status_code:"recorded"})
  };
}

test("daily AI visual request is locked to approved V8 full-day form",()=>{
  const report=dailyReport();
  const request=buildAiVisualRequest(report);
  assert.equal(validateAiVisualRequest(request,report),true);
  assert.equal(request.reference_asset,"attendance-ai-reference-daily-v1.png");
  assert.match(request.prompt,/APPROVED FULL-DAY FORM V8/);
  assert.match(request.prompt,/TỔNG GIỜ CÔNG THEO NHÂN SỰ/);
  assert.match(request.prompt,/TỔNG QUAN CẢ NGÀY/);
  assert.match(request.prompt,/CHI TIẾT CHẤM CÔNG CẢ NGÀY/);
  assert.match(request.prompt,/STT \| Họ và tên \| Ca sáng \| Ca chiều \| Tổng công \| Trạng thái/);
  assert.match(request.prompt,/Morning duration = professional blue segment/);
  assert.match(request.prompt,/Afternoon duration = fresh green segment/);
  assert.match(request.prompt,/Điêu Văn Mạnh/);
  assert.doesNotMatch(request.prompt,/Điều Văn Mạnh/);
  assert.equal(request.data.recorded_count,7);
  assert.equal(request.data.no_record_count,1);
  assert.equal(request.data.total_hours_text,"63h00");
});

test("morning AI visual request is locked to approved V7 full form",()=>{
  const report=morningReport();
  const request=buildAiVisualRequest(report);
  assert.equal(validateAiVisualRequest(request,report),true);
  assert.equal(request.reference_asset,"attendance-ai-reference-morning-v1.png");
  assert.equal(request.data.recorded_count,7);
  assert.equal(request.data.missing_count,1);
  assert.equal(request.data.attendance_rate,88);
  assert.match(request.prompt,/APPROVED MORNING FORM V7/);
  assert.match(request.prompt,/THỜI LƯỢNG CA SÁNG THEO NHÂN SỰ/);
  assert.match(request.prompt,/TỔNG QUAN/);
  assert.match(request.prompt,/CHI TIẾT CHẤM CÔNG CA SÁNG/);
  assert.match(request.prompt,/STT \| Họ và tên \| Trạng thái \| Giờ vào \| Giờ ra \| Thời lượng \| Mức công/);
  assert.match(request.prompt,/Điêu Văn Mạnh/);
  assert.doesNotMatch(request.prompt,/Điều Văn Mạnh/);
  assert.match(request.prompt,/ABSOLUTELY NO LOGO/);
  assert.match(request.prompt,/Exactly 8 employee rows must be visible/);
});
