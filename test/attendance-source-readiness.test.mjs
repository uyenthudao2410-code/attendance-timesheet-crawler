import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessAttendanceSourceReadiness,
  assertAttendanceSourceReady
} from '../src/attendance-source-readiness.mjs';

const date='2026-10-08';
const session=(start='07:02',end='11:35')=>({in:start,out:end,minutes:273});
const healthy=(i)=>({
  name:'Employee '+i,access_ok:true,status:'complete',
  data_source:'attendance_api_direct',
  morning:session(),afternoon:session('13:05','17:10'),
  sessions:[session(),session('13:05','17:10')]
});
const raw=()=>({
  schema_version:5,date,timezone:'Asia/Ho_Chi_Minh',
  generated_at:'2026-10-09T00:00:00.000Z',
  employees:Array.from({length:8},(_,i)=>healthy(i+1))
});
const assess=(source,slot='daily_2105')=>
  assessAttendanceSourceReadiness(source,{slot,targetDate:date});

test('all eight verified punch sources are ready for full-day and morning V24',()=>{
  for(const slot of ['daily_2105','morning_1230']){
    const check=assess(raw(),slot);
    assert.equal(check.ok,true);
    assert.equal(check.recorded,8);
    assert.equal(check.morning_recorded,8);
    assert.equal(check.technical,0);
  }
});

test('one verified absence with real historical records is not a broken source',()=>{
  const input=raw();
  input.employees[5]={
    name:'Employee 6',status:'date_not_found',access_ok:true,
    device_history:{history_record_count:21,target_date_present:false,latest_record_date:'2026-10-07'}
  };
  assert.equal(assess(input).ok,true);
  assert.equal(assess(input).verified_absent,1);
});

test('a technical error cannot be published as no attendance',()=>{
  const input=raw();
  input.employees[6]={name:'Employee 7',status:'technical_error',access_ok:false};
  assert.equal(assess(input).technical,1);
  assert.throws(()=>assertAttendanceSourceReady(input,{slot:'daily_2105',targetDate:date}),
    /ATTENDANCE_SOURCE_NOT_READY/);
});

test('date_not_found without validated previous history is not a confirmed absence',()=>{
  for(const history of [null,{history_record_count:0,target_date_present:false},
    {history_record_count:3,target_date_present:true}]){
    const input=raw();
    input.employees[2]={name:'Employee 3',access_ok:true,status:'date_not_found',
      device_history:history};
    assert.equal(assess(input).ok,false);
    assert.equal(assess(input).unverified_absent,1);
  }
});

test('a complete status without actual time evidence cannot pass source readiness',()=>{
  const input=raw();
  input.employees[0]={name:'Employee 1',access_ok:true,status:'complete',sessions:[]};
  assert.equal(assess(input).missing_marks,1);
  assert.equal(assess(input).ok,false);
});

test('all employees without recorded data is fail-closed, not an invented zero report',()=>{
  const input=raw();
  input.employees=input.employees.map((e)=>({
    name:e.name,status:'date_not_found',access_ok:true,
    device_history:{history_record_count:9,target_date_present:false}
  }));
  assert.equal(assess(input).verified_absent,8);
  assert.equal(assess(input).recorded,0);
  assert.equal(assess(input).ok,false);
  assert.match(assess(input).problem_codes.join(','),/no_verified_target_date_punches/);
});

test('morning requires morning evidence and ignores afternoon-only source records',()=>{
  const input=raw();
  input.employees=input.employees.map((e)=>({
    ...e,morning:null,
    sessions:[session('13:10','17:01')],
    afternoon:session('13:10','17:01'),status:'incomplete'
  }));
  assert.equal(assess(input,'daily_2105').ok,true);
  assert.equal(assess(input,'morning_1230').ok,false);
  assert.match(assess(input,'morning_1230').problem_codes.join(','),
    /no_verified_morning_punches/);
});

test('source report cannot substitute a different date or employee count',()=>{
  const input=raw();
  assert.throws(()=>assessAttendanceSourceReadiness(input,{slot:'daily_2105',targetDate:'2026-10-07'}),
    /SOURCE_IDENTITY_MISMATCH/);
  input.employees.pop();
  assert.throws(()=>assess(input),/SOURCE_ROSTER_COUNT_MISMATCH/);
});
