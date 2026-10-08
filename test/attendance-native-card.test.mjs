import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT, ROW_VISUAL_REVISION, buildNativeCard, auditCard, validateSource, validateDirectory, sourceDigest,
  durationMinutes, sessionMinutes, shiftTotalMinutes,
  workdaysFromMinutes, formatRecordedMinutes, formatWorkdays,
  overviewStatusChart, consolidatedShiftChart, consolidatedWorkdayChart, shiftChartLabel,
  workforceScales, employeeAlignedRow, employeeNativeBar, employeeDetailPanel
} from '../src/attendance-native-card.mjs';

const input=JSON.parse(fs.readFileSync(
  process.env.NATIVE_TEST_SOURCE || 'test/fixtures/attendance-native-card-input.json','utf8'
));
const directory=JSON.parse(fs.readFileSync(
  process.env.NATIVE_TEST_DIRECTORY || 'test/fixtures/attendance-user-directory.json','utf8'
));

const all=root=>{
  const result=[];
  const walk=v=>{
    if(!v || typeof v!=='object') return;
    if(v.type) result.push(v);
    Object.values(v).forEach(walk);
  };
  walk(root);
  return result;
};

test('source and directory bindings remain exact',()=>{
  const before=JSON.stringify(input);
  assert.equal(validateSource(input),input);
  assert.equal(validateDirectory(input,directory),directory);
  assert.equal(sourceDigest(input),'cedcad7b9226d6009a0e516aa1fcb198cf8e715276a060831125fb9c30336f6e');
  buildNativeCard(input,directory);
  assert.equal(JSON.stringify(input),before);
});

test('workday conversion and source durations remain exact',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(workdaysFromMinutes(657),1.37);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
  assert.equal(shiftTotalMinutes(input.employees[0],'morning'),290);
  assert.equal(shiftTotalMinutes(input.employees[0],'afternoon'),367);
  assert.equal(sessionMinutes(input.employees[6].afternoon).length,0);
});

test('overview is compact and uses bright blue-green status colors',()=>{
  const c=overviewStatusChart(input);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.deepEqual(c.data[0].data,[
    {legend:'Đã chốt',value:6,color:'categoricalBlue'},
    {legend:'Chưa chốt',value:2,color:'categoricalGreen'}
  ]);
});

test('one consolidated shift chart shows per-row morning and afternoon values',()=>{
  const c=consolidatedShiftChart(input);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.equal(c.id,'workforce-shift-chart');
  assert.equal(c.showLegend,true);
  assert.equal(c.showBarValues,true);
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.data.length,8);
  assert.equal(shiftChartLabel(input.employees[0]),'4.8 | 6.1');
  assert.equal(shiftChartLabel(input.employees[2]),'– | 5.0');
  assert.equal(shiftChartLabel(input.employees[6]),'4.1 | –');
  assert.equal(c.data[0].title,'4.8 | 6.1');
  assert.deepEqual(c.data[0].data,[
    {legend:'Ca sáng',value:4.8,color:'categoricalBlue'},
    {legend:'Ca chiều',value:6.1,color:'categoricalGreen'}
  ]);
  assert.deepEqual(c.data[2].data,[
    {legend:'Ca chiều',value:5,color:'categoricalGreen'}
  ]);
});

test('one consolidated workday chart carries all eight employees',()=>{
  const c=consolidatedWorkdayChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.id,'workforce-workdays-chart');
  assert.equal(c.showLegend,false);
  assert.equal(c.showBarValues,true);
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.data.length,8);
  assert.deepEqual(c.data.map(d=>d.y),[1.37,1.22,0.62,1.13,1,1.15,0.52,1.21]);
  assert.ok(c.data.every(d=>d.color==='categoricalBlue'));
});

test('workday bar has common scale and preserves recorded values',()=>{
  const scales=workforceScales(input);
  assert.deepEqual(scales,{shift:12,workday:1.5});
  input.employees.forEach((employee,index)=>{
    const workday=employeeNativeBar(employee,index,'workday',scales.workday);
    const shift=employeeNativeBar(employee,index,'shift',scales.shift);
    assert.equal(workday.type,'Chart.HorizontalBar.Stacked');
    assert.equal(workday.showLegend,false);
    assert.equal(workday.showBarValues,false);
    assert.equal(workday.data.length,1);
    assert.equal(Number(workday.data[0].data.reduce((n,x)=>n+x.value,0).toFixed(2)),scales.workday);
    assert.equal(Number(shift.data[0].data.reduce((n,x)=>n+x.value,0).toFixed(2)),scales.shift);
    assert.equal(workday.data[0].data[0].value,workdaysFromMinutes(
      [...sessionMinutes(employee.morning),...sessionMinutes(employee.afternoon)]
        .reduce((a,b)=>a+b,0)
    ));
  });
});

test('each avatar shares a physical column row with its two metric views',()=>{
  const card=buildNativeCard(input,directory);
  const rows=card.body.find(n=>n.id==='employee-chart-rows');
  assert.ok(rows);
  assert.equal(rows.items.length,8);
  rows.items.forEach((row,index)=>{
    assert.equal(row.id,'employee-row-'+(index+1));
    const columns=row.items[0].columns;
    assert.deepEqual(columns.map(c=>c.width),['46px','stretch']);
    const avatar=columns[0].items[0];
    assert.deepEqual(avatar.selectAction.targetElements,['employee-detail-'+(index+1)]);
    assert.equal(avatar.items[0].type,'Image');
    assert.equal(avatar.items[0].style,'Person');
    assert.equal(avatar.items[0].height,'36px');
    assert.equal(avatar.items[0].altText,'');
    const [shift,workday]=columns[1].items;
    assert.equal(shift.id,'shift-metric-'+(index+1));
    assert.equal(workday.id,'workday-metric-'+(index+1));
    assert.equal(shift.isVisible,true);
    assert.equal(workday.isVisible,false);
    assert.equal(shift.items[1].id,'shift-employee-bar-'+(index+1));
    assert.equal(workday.items[1].id,'workday-employee-bar-'+(index+1));
    assert.equal(row.items[1].id,'employee-detail-'+(index+1));
    assert.equal(row.items[1].isVisible,false);
  });
});

test('detail panels are hidden and preserve complete attendance data',()=>{
  const d=employeeDetailPanel(input.employees[0],0);
  assert.equal(d.id,'employee-detail-1');
  assert.equal(d.isVisible,false);
  const json=JSON.stringify(d);
  for(const value of [
    'Điêu Văn Mạnh','10h57','1,37 công','Chưa chốt',
    '08:37–13:27 · 4h50','13:27–19:34 · 6h07'
  ]) assert.ok(json.includes(value),value);
});

test('toggle switches 8 chart pairs but never duplicates avatars',()=>{
  const card=buildNativeCard(input,directory);
  const actions=card.body.find(n=>n.id==='chart-view-toggle').actions;
  assert.equal(actions.length,2);
  assert.equal(actions[0].targetElements.length,18);
  assert.equal(actions[1].targetElements.length,18);
  assert.equal(actions[0].targetElements.find(n=>n.elementId==='shift-metric-3').isVisible,true);
  assert.equal(actions[1].targetElements.find(n=>n.elementId==='shift-metric-3').isVisible,false);
  assert.equal(actions[1].targetElements.find(n=>n.elementId==='workday-metric-3').isVisible,true);
  assert.equal(all(card).filter(n=>n.type==='Image').length,8);
  assert.equal(all(card).filter(n=>n.type==='Chart.HorizontalBar.Stacked').length,17);
  assert.equal(card.body.some(n=>n.id==='compact-chart-grid'),false);
  assert.equal(card.body.some(n=>n.id==='report-legend'),false);
});

test('one compact legend per view, not 8 repeated chart legends',()=>{
  const card=buildNativeCard(input,directory);
  const guide=card.body.find(n=>n.id==='shift-view-guide');
  assert.ok(guide);
  assert.ok(JSON.stringify(guide).includes('Ca sáng'));
  assert.ok(JSON.stringify(guide).includes('Ca chiều'));
  const rows=card.body.find(n=>n.id==='employee-chart-rows').items;
  assert.ok(rows.every(row=>row.items[0].columns[1].items.every(view=>view.items[1].showLegend===false)));
});

test('Graph profile photo map overrides initials without exposing names beside avatars',()=>{
  const graphAvatars=Object.fromEntries(
    input.employees.map(e=>[e.name,'data:image/jpeg;base64,/9j/2Q=='])
  );
  const card=buildNativeCard(input,directory,graphAvatars);
  const qa=auditCard(card,input,directory,graphAvatars);
  assert.equal(qa.avatar_render,'graph_profile_photo');
  assert.equal(qa.graph_avatar_count,8);
  assert.equal(qa.image_avatar_count,8);
  const rows=card.body.find(n=>n.id==='employee-chart-rows').items;
  rows.forEach((row,i)=>{
    assert.equal(row.items[0].columns[0].items[0].items[0].url,
      'data:image/jpeg;base64,/9j/2Q==');
    assert.equal(JSON.stringify(row.items[0].columns[0]).includes(input.employees[i].name),false);
  });
});

test('hidden details stay immediately below each employee chart row',()=>{
  const rows=buildNativeCard(input,directory).body.find(n=>n.id==='employee-chart-rows').items;
  assert.equal(rows.length,8);
  assert.ok(rows.every((row,i)=>row.items[1].id==='employee-detail-'+(i+1) &&
    row.items[1].isVisible===false));
});

test('V24 contract balances avatars and exposes shift values',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);

  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V24_BALANCED_INFO_BARS');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.chart_architecture,'row_locked_native_stacked_comparative_bars');
  assert.equal(qa.visual_revision,ROW_VISUAL_REVISION);
  assert.equal(qa.row_lock,true);
  assert.equal(qa.shift_chart_count,8);
  assert.equal(qa.workday_chart_count,8);
  assert.equal(qa.avatar_rail_count,8);
  assert.equal(qa.detail_interaction,'avatar_tap_toggle_own_detail');
  assert.equal(qa.detail_buttons,0);
  assert.equal(qa.details_hidden_by_default,true);
  assert.equal(qa.footer_notes,false);
  assert.equal(qa.repeated_legends,false);
  assert.equal(qa.palette,'categoricalBlue_categoricalGreen_categoricalTeal_neutral');
  assert.equal(qa.shift_legend,'one_compact_guide_per_active_view');
  assert.equal(qa.avatar_alignment,'same_columnset_per_employee_row');
  assert.equal(qa.shift_row_values,'exact_source_morning_and_afternoon_durations');
  assert.equal(qa.workday_chart_layout,'same_row_as_avatar_common_scale');
  assert.equal(qa.native_microsoft_charts_only,true);
  assert.equal(qa.native_microsoft_personas,false);
  assert.equal(qa.avatar_render,'embedded_png_fallback');
  assert.equal(qa.graph_avatar_count,0);
  assert.equal(qa.image_avatar_count,8);
  assert.equal(qa.persona_component_count,0);
  assert.equal(qa.external_chart_requests,0);
  assert.equal(all(card).filter(n=>n.type==='Image').length,8);
  assert.equal(JSON.stringify(card).includes('quickchart'),false);
  assert.ok(qa.bytes<27000);
});

test('mutating chart data or Entra binding fails closed',()=>{
  const card=buildNativeCard(input,directory);
  const row=card.body.find(n=>n.id==='employee-chart-rows').items[0];
  row.items[0].columns[1].items[0].items[1].data[0].data[0].value=99;
  assert.throws(()=>auditCard(card,input,directory),/Layout\/data mismatch/);

  const bad=structuredClone(directory);
  bad[input.employees[0].name].id='not-an-id';
  assert.throws(()=>buildNativeCard(input,bad),/Invalid Entra id/);
});

test('incorrect KPI and incomplete roster fail closed',()=>{
  const changed=structuredClone(input);
  changed.kpis.closed=8;
  assert.throws(()=>buildNativeCard(changed,directory),/KPI/);
  changed.employees.pop();
  assert.throws(()=>buildNativeCard(changed,directory),/eight/);
});

test('morning report hides afternoon legend and totals in overview',()=>{
  const morning=structuredClone(input);
  morning.report_title='BÁO CÁO CHẤM CÔNG — CA SÁNG';
  morning.report_scope='morning';
  morning.employees.forEach(e=>{
    e.afternoon='—';
    if(e.status==='Đã ghi nhận')e.total=formatRecordedMinutes(shiftTotalMinutes(e,'morning'));
  });
  morning.kpis.with_record=morning.employees.filter(e=>e.morning!=='—').length;
  morning.rate=String(Math.round(morning.kpis.with_record/8*100))+'%';
  morning.total_hours=formatRecordedMinutes(morning.employees
    .filter(e=>e.status==='Đã ghi nhận')
    .reduce((n,e)=>n+durationMinutes(e.total),0));
  const card=buildNativeCard(morning,directory);
  assert.equal(JSON.stringify(card.body.find(n=>n.id==='shift-view-guide')).includes('Ca chiều'),false);
  assert.equal(JSON.stringify(card.body.find(n=>n.id==='overview')).includes('Chiều '),false);
  assert.equal(workforceScales(morning).shift,8);
});
