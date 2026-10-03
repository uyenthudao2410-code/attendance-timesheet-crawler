import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_LAYOUT_VERSION,CANVAS,MASTER_TEMPLATE_IDS,MASTER_TEMPLATE_BLOB_SHAS,
  buildAttendanceReportSvg,getMasterTemplateFingerprint
} from "../src/attendance-image.mjs";
const N=["Điêu Văn Mạnh","Nguyễn Thị Thục Anh","Vũ Đình Tuệ","Bùi Duy Hoàng","Nguyễn Thành Long","Trần Thanh Bình","Lê Thị Phương Linh","Lê Đăng Hiếu"];
function morning(){return{kind:"attendance_business_report",slot:"morning_1230",date:"2026-10-02",timezone:"Asia/Ho_Chi_Minh",employees:N.map((name,i)=>i===7?{name,morning:null,status_code:"not_recorded_morning"}:{name,morning:{in:"08:00",out:"12:00",minutes:240},status_code:"recorded"})};}
function daily(){return{kind:"attendance_business_report",slot:"daily_2105",date:"2026-10-01",timezone:"Asia/Ho_Chi_Minh",employees:N.map(name=>({name,sessions:[{in:"08:00",out:"12:00",minutes:240},{in:"13:30",out:"18:30",minutes:300}],total_minutes:540,total_display:"9h00",status_code:"recorded"}))};}
test("V5 locks one fixed 3:4 master template per slot",()=>{
  assert.equal(APPROVED_LAYOUT_VERSION,"ATTENDANCE_IMAGE_V5_LOCKED_MASTER_2026_10_02");
  assert.deepEqual(CANVAS,{width:1080,height:1440});
  assert.deepEqual(getMasterTemplateFingerprint("morning_1230"),{template_id:MASTER_TEMPLATE_IDS.morning_1230,git_blob_sha:MASTER_TEMPLATE_BLOB_SHAS.morning_1230});
  assert.deepEqual(getMasterTemplateFingerprint("daily_2105"),{template_id:MASTER_TEMPLATE_IDS.daily_2105,git_blob_sha:MASTER_TEMPLATE_BLOB_SHAS.daily_2105});
});
test("morning V5 changes values without changing fixed form",()=>{
  const svg=buildAttendanceReportSvg(morning());
  assert.match(svg,/CHẤM CÔNG — CA SÁNG/);
  assert.match(svg,/GIỜ CÔNG CA SÁNG THEO NHÂN SỰ/);
  assert.match(svg,/CHI TIẾT CHẤM CÔNG CA SÁNG/);
  assert.match(svg,/Điêu Văn Mạnh/);
  assert.doesNotMatch(svg,/\{\{/);
});
test("daily V5 keeps fixed morning afternoon columns",()=>{
  const svg=buildAttendanceReportSvg(daily());
  assert.match(svg,/CHẤM CÔNG — CẢ NGÀY/);
  assert.match(svg,/CA SÁNG/);
  assert.match(svg,/CA CHIỀU/);
  assert.match(svg,/08:00–12:00/);
  assert.match(svg,/13:30–18:30/);
  assert.doesNotMatch(svg,/\{\{/);
});
test("V5 rejects non-8-person roster",()=>{const r=morning();r.employees.pop();assert.throws(()=>buildAttendanceReportSvg(r),/exactly 8 employees/);});
