import test from 'node:test';
import assert from 'node:assert/strict';
import {businessReportToNativeSource} from '../src/attendance-native-production-source.mjs';
import {buildNativeCard,auditCard} from '../src/attendance-native-card.mjs';
import directory from './fixtures/attendance-user-directory.json' with {type:'json'};

const names=Object.keys(directory);

function morningReport(){
  return {
    schema_version:1,
    kind:'attendance_business_report',
    slot:'morning_1230',
    date:'2026-10-07',
    timezone:'Asia/Ho_Chi_Minh',
    generated_at:'2026-10-07T06:41:10.000Z',
    source_generated_at:'2026-10-07T06:40:20.000Z',
    employee_count:8,
    employees:names.map((name,i)=>({
      name,
      morning:i<3?{in:'07:00',out:'11:00',minutes:240,duration:'4h00'}:null,
      status_code:i<3?'recorded':'not_recorded_morning',
      status_text:i<3?'Đã ghi nhận':'⚠️ Chưa ghi nhận ca sáng'
    }))
  };
}

function dailyReport(){
  return {
    schema_version:1,
    kind:'attendance_business_report',
    slot:'daily_2105',
    date:'2026-10-06',
    timezone:'Asia/Ho_Chi_Minh',
    generated_at:'2026-10-07T00:41:10.000Z',
    source_generated_at:'2026-10-07T00:40:20.000Z',
    employee_count:8,
    employees:names.map((name,i)=>({
      name,
      sessions:i===7?[
        {in:'07:00',out:'11:00',minutes:240,duration:'4h00'},
        {in:'13:00',out:'18:00',minutes:300,duration:'5h00'}
      ]:[],
      total_minutes:i===7?540:null,
      total_display:i===7?'9h00':'—',
      status_code:i===7?'recorded':'not_recorded',
      status_text:i===7?'Đã ghi nhận 2 ca/phiên':'⚠️ Chưa ghi nhận'
    }))
  };
}

test('morning report maps to V24 source without inventing afternoon data',()=>{
  const s=businessReportToNativeSource(morningReport());
  assert.equal(s.report_title,'BÁO CÁO CHẤM CÔNG — CA SÁNG');
  assert.equal(s.report_scope,'morning');
  assert.equal(s.kpis.total,8);
  assert.equal(s.kpis.with_record,3);
  assert.equal(s.kpis.closed,3);
  assert.equal(s.rate,'38%');
  assert.equal(s.total_hours,'12h00');
  assert.equal(s.employees[0].morning,'07:00–11:00 (4h00)');
  assert.equal(s.employees[0].afternoon,'—');
  assert.equal(s.employees[3].status,'Chưa có bản ghi');
  const card=buildNativeCard(s,directory);
  assert.ok(JSON.stringify(card).includes('BÁO CÁO CHẤM CÔNG — CA SÁNG'));
  assert.equal(auditCard(card,s,directory).data_gate,'passed');
});

test('full-day report maps morning and afternoon sessions into the same V24 design',()=>{
  const s=businessReportToNativeSource(dailyReport());
  assert.equal(s.report_title,'BÁO CÁO CHẤM CÔNG — CẢ NGÀY');
  assert.equal(s.report_scope,'daily');
  assert.equal(s.kpis.with_record,1);
  assert.equal(s.kpis.closed,1);
  assert.equal(s.rate,'13%');
  assert.equal(s.total_hours,'9h00');
  assert.equal(s.employees[7].morning,'07:00–11:00 (4h00)');
  assert.equal(s.employees[7].afternoon,'13:00–18:00 (5h00)');
  assert.equal(s.employees[7].total,'9h00');
  assert.equal(auditCard(buildNativeCard(s,directory),s,directory).data_gate,'passed');
});
