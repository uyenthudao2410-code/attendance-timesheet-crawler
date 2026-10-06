import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT, buildNativeCard, auditCard, validateSource, validateDirectory, sourceDigest,
  durationMinutes, sessionMinutes, shiftTotalMinutes,
  workdaysFromMinutes, formatRecordedMinutes, formatWorkdays,
  overviewStatusChart, employeeShiftMiniChart, employeeWorkdayMiniChart,
  avatarChartRow, employeeDetailPanel
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

test('overview remains compact and native',()=>{
  const card=buildNativeCard(input,directory);
  const overview=card.body.find(n=>n.id==='overview');
  assert.ok(overview);
  const status=all(overview).find(n=>n.id==='overview-status-chart');
  assert.equal(status.type,'Chart.HorizontalBar.Stacked');
  assert.deepEqual(status.data[0].data.map(d=>[d.legend,d.value]),[
    ['Đã chốt',6],['Chưa chốt',2]
  ]);
});

test('shift mini chart is a native Microsoft stacked chart with values shown',()=>{
  const c=employeeShiftMiniChart(input.employees[0],0);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.equal(c.id,'shift-chart-1');
  assert.equal(c.showBarValues,true);
  assert.equal(c.showLegend,false);
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.deepEqual(c.data[0].data,[
    {legend:'Sáng',value:4.8,color:'categoricalBlue'},
    {legend:'Chiều',value:6.1,color:'categoricalTeal'}
  ]);
});

test('workday mini chart is a native Microsoft bar with value shown',()=>{
  const c=employeeWorkdayMiniChart(input.employees[0],0);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.id,'workday-chart-1');
  assert.equal(c.showBarValues,true);
  assert.equal(c.showLegend,false);
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.data[0].y,1.37);
});

test('each shift row has exactly two visual modules: avatar-only PersonaSet and chart',()=>{
  const row=avatarChartRow(input.employees[0],0,directory,'shift');
  assert.equal(row.type,'Container');
  assert.equal(row.id,'shift-row-1');
  assert.equal(row.items.length,1);
  const columns=row.items[0].columns;
  assert.equal(columns.length,2);
  assert.deepEqual(columns.map(c=>c.width),[12,88]);

  const avatar=columns[0].items[0];
  assert.equal(avatar.type,'Component');
  assert.equal(avatar.name,'graph.microsoft.com/users');
  assert.equal(avatar.view,'compact');
  assert.equal(avatar.properties.users.length,1);
  assert.equal(avatar.properties.users[0].id,directory['Điêu Văn Mạnh'].id);

  const chart=columns[1].items[0];
  assert.equal(chart.type,'Chart.HorizontalBar.Stacked');
  assert.equal(chart.showBarValues,true);

  assert.equal(columns[0].items.length,1);
  assert.equal(columns[1].items.length,1);
});

test('workday mode is one compact native Microsoft summary chart',()=>{
  const card=buildNativeCard(input,directory);
  const panel=card.body.find(n=>n.id==='panel-workdays');
  assert.equal(panel.isVisible,false);
  const chart=panel.items.find(n=>n.id==='workforce-workdays-chart');
  assert.equal(chart.type,'Chart.HorizontalBar');
  assert.equal(chart.showBarValues,true);
  assert.equal(chart.displayMode,'AbsoluteNoAxis');
  assert.equal(chart.data.length,8);
  assert.deepEqual(chart.data.map(d=>d.y),[1.37,1.22,0.62,1.13,1,1.15,0.52,1.21]);
});

test('tap on either row toggles that employee detail panel',()=>{
  const shift=avatarChartRow(input.employees[0],0,directory,'shift');
  const workday=avatarChartRow(input.employees[0],0,directory,'workday');
  for(const row of [shift,workday]){
    assert.equal(row.selectAction.type,'Action.ToggleVisibility');
    assert.deepEqual(row.selectAction.targetElements,['employee-detail-1']);
  }
});

test('detail panel is hidden by default and contains name, total, workday, status, morning and afternoon',()=>{
  const d=employeeDetailPanel(input.employees[0],0);
  assert.equal(d.id,'employee-detail-1');
  assert.equal(d.isVisible,false);
  const json=JSON.stringify(d);
  for(const value of [
    'Điêu Văn Mạnh','10h57','1,37 công','Chưa chốt',
    '08:37–13:27 · 4h50','13:27–19:34 · 6h07'
  ]) assert.ok(json.includes(value),value);
});

test('card has eight two-module rows per mode and eight shared hidden detail panels',()=>{
  const card=buildNativeCard(input,directory);
  const shift=card.body.find(n=>n.id==='panel-shifts');
  const workday=card.body.find(n=>n.id==='panel-workdays');
  const details=card.body.find(n=>n.id==='details-area');

  assert.equal(shift.items.length,8);
  assert.equal(workday.items.length,2);
  assert.equal(details.items.length,8);

  assert.ok(shift.items.every((r,i)=>r.id==='shift-row-'+(i+1)));
  assert.ok(workday.items.some(n=>n.id==='workforce-workdays-chart'));
  assert.ok(details.items.every((r,i)=>r.id==='employee-detail-'+(i+1) && r.isVisible===false));
});

test('chart toggle switches between two avatar plus chart modes',()=>{
  const card=buildNativeCard(input,directory);
  const actionSet=card.body.find(n=>n.id==='chart-view-toggle');
  assert.equal(actionSet.actions.length,2);
  assert.equal(actionSet.actions[0].title,'Theo ca');
  assert.equal(actionSet.actions[1].title,'Công quy đổi');
  assert.equal(card.body.find(n=>n.id==='panel-shifts').isVisible,true);
  assert.equal(card.body.find(n=>n.id==='panel-workdays').isVisible,false);
});

test('V18 contract is native, avatar-only, row-tappable and external-resource-free',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);

  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V18_AVATAR_CHART_TAP');
  assert.equal(qa.data_gate,'passed');
  assert.deepEqual(qa.row_modules,['avatar','microsoft_native_chart']);
  assert.equal(qa.employee_row_module_count,2);
  assert.equal(qa.shift_mini_chart_count,8);
  assert.equal(qa.workday_mini_chart_count,0);
  assert.equal(qa.workday_summary_chart_count,1);
  assert.equal(qa.detail_interaction,'row_toggle_visibility');
  assert.equal(qa.details_hidden_by_default,true);
  assert.equal(qa.native_microsoft_charts_only,true);
  assert.equal(qa.native_microsoft_personas,true);
  assert.equal(qa.external_chart_requests,0);
  assert.equal(all(card).filter(n=>n.type==='Image').length,0);
  assert.equal(JSON.stringify(card).includes('quickchart'),false);
  assert.ok(qa.bytes<27000);
});

test('mutating data or Entra binding fails closed',()=>{
  const card=buildNativeCard(input,directory);
  card.body.find(n=>n.id==='panel-shifts').items[0].items[0].columns[1].items[0]
    .data[0].data[0].value=99;
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
