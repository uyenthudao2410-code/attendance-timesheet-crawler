import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertAttendanceSourceReady} from '../src/attendance-source-readiness.mjs';
import {buildAttendanceBusinessReport} from '../src/report-builder.mjs';
import {businessReportToNativeSource} from '../src/attendance-native-production-source.mjs';
import {buildNativeCard,auditCard} from '../src/attendance-native-card.mjs';

const directory=JSON.parse(fs.readFileSync('test/fixtures/attendance-user-directory.json','utf8'));
const names=Object.keys(directory);
const date='2026-10-08';

test('eight independently confirmed no-punch source records produce valid V24 zero-day card',()=>{
  assert.equal(names.length,8);
  const raw={
    schema_version:5,date,timezone:'Asia/Ho_Chi_Minh',
    generated_at:'2026-10-09T00:02:00.000Z',
    employees:names.map(name=>({
      name,access_ok:true,status:'date_not_found',
      data_source:'attendance_api_direct_history',
      device_history:{
        history_record_count:14,
        target_date_present:false,
        latest_record_date:'2026-10-07',
        interpretation:'history_exists_but_no_target_date'
      }
    }))
  };
  for(const slot of ['daily_2105','morning_1230']){
    const ready=assertAttendanceSourceReady(raw,{slot,targetDate:date});
    assert.equal(ready.verified_absent,8);
    const report=buildAttendanceBusinessReport(raw,slot,names);
    const source=businessReportToNativeSource(report);
    assert.equal(source.kpis.total,8);
    assert.equal(source.kpis.with_record,0);
    assert.equal(source.kpis.closed,0);
    assert.equal(source.kpis.attention,8);
    assert.equal(source.total_hours,'0h00');
    const card=buildNativeCard(source,directory);
    const qa=auditCard(card,source,directory);
    assert.ok(qa.bytes<=18000);
    assert.equal(qa.image_avatar_count,0);
    assert.equal(qa.graph_persona_count,0);
    assert.equal(qa.verified_Entra_account_count,slot==='daily_2105'?8:0);
  }
});
