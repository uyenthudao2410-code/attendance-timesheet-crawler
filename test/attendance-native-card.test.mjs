import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT, buildNativeCard, auditCard, validateSource, validateDirectory, sourceDigest,
  durationMinutes, sessionMinutes, shiftTotalMinutes,
  workdaysFromMinutes, formatRecordedMinutes, formatWorkdays,
  overviewStatusChart, employeeShiftMiniChart, avatarChartRow, employeeDetailPanel
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

test('overview uses future teal and purple status palette',()=>{
  const c=overviewStatusChart(input);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.deepEqual(c.data[0].data,[
    {legend:'Đã chốt',value:6,color:'categoricalLightBlue'},
    {legend:'Chưa chốt',value:2,color:'divergingCyan'}
  ]);
});

test('mini chart has no visible category title or repeated text legends',()=>{
  const c=employeeShiftMiniChart(input.employees[0],0);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.equal(c.showLegend,false);
  assert.equal(c.showBarValues,true);
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.title,'\u200B');
  assert.equal(c.data[0].title,'\u200B');
  assert.deepEqual(c.data[0].data,[
    {value:4.8,color:'categoricalLightBlue'},
    {value:6.1,color:'divergingCyan'}
  ]);
  assert.equal(JSON.stringify(c).includes('Unknown'),false);
  assert.equal(JSON.stringify(c).includes('Sáng'),false);
  assert.equal(JSON.stringify(c).includes('Chiều'),false);
});

test('each person row is avatar plus chart, followed by a detail button and hidden detail',()=>{
  const row=avatarChartRow(input.employees[0],0,directory,'shift');
  assert.equal(row.id,'shift-row-1');
  assert.equal(row.items.length,3);

  const visual=row.items[0];
  assert.equal(visual.type,'ColumnSet');
  assert.equal(visual.columns.length,2);
  assert.deepEqual(visual.columns.map(c=>c.width),['32px','stretch']);

  const avatar=visual.columns[0].items[0];
  assert.equal(avatar.type,'Component');
  assert.equal(avatar.name,'graph.microsoft.com/users');
  assert.equal(avatar.properties.users.length,1);
  assert.equal(avatar.properties.users[0].id,directory['Điêu Văn Mạnh'].id);

  const chart=visual.columns[1].items[0];
  assert.equal(chart.type,'Chart.HorizontalBar.Stacked');
  assert.equal(chart.showBarValues,true);

  const actionSet=row.items[1];
  assert.equal(actionSet.type,'ActionSet');
  assert.equal(actionSet.actions.length,1);
  assert.equal(actionSet.actions[0].title,'Chi tiết');
  assert.deepEqual(actionSet.actions[0].targetElements,['employee-detail-1']);

  const detail=row.items[2];
  assert.equal(detail.id,'employee-detail-1');
  assert.equal(detail.isVisible,false);
});

test('main chart row contains no visible employee name text',()=>{
  const row=avatarChartRow(input.employees[0],0,directory,'shift');
  const visibleVisual=row.items[0];
  const textNodes=all(visibleVisual).filter(n=>n.type==='TextBlock' || n.type==='RichTextBlock');
  assert.ok(textNodes.every(n=>!JSON.stringify(n).includes('Điêu Văn Mạnh')));
  assert.ok(textNodes.every(n=>!JSON.stringify(n).includes('Văn Mạnh')));
});

test('detail panel omits repeated morning and afternoon labels but preserves times',()=>{
  const d=employeeDetailPanel(input.employees[0],0);
  const json=JSON.stringify(d);
  for(const value of [
    'Điêu Văn Mạnh','10h57','1,37 công','Chưa chốt',
    '08:37–13:27 · 4h50','13:27–19:34 · 6h07'
  ]) assert.ok(json.includes(value),value);
  assert.equal(json.includes('SÁNG'),false);
  assert.equal(json.includes('CHIỀU'),false);
});

test('all eight shift rows include their own detail button and local hidden detail',()=>{
  const card=buildNativeCard(input,directory);
  const panel=card.body.find(n=>n.id==='panel-shifts');
  assert.equal(panel.items.length,8);
  panel.items.forEach((row,i)=>{
    assert.equal(row.id,'shift-row-'+(i+1));
    assert.equal(row.items[1].id,'detail-action-'+(i+1));
    assert.equal(row.items[2].id,'employee-detail-'+(i+1));
    assert.equal(row.items[2].isVisible,false);
  });
  assert.equal(card.body.some(n=>n.id==='details-area'),false);
});

test('workday mode stays compact as one Microsoft native chart',()=>{
  const card=buildNativeCard(input,directory);
  const panel=card.body.find(n=>n.id==='panel-workdays');
  assert.equal(panel.isVisible,false);
  const chart=panel.items.find(n=>n.id==='workforce-workdays-chart');
  assert.equal(chart.type,'Chart.HorizontalBar');
  assert.equal(chart.showBarValues,true);
  assert.equal(chart.data.length,8);
});

test('footer notes and repeated shift legends are completely removed',()=>{
  const card=buildNativeCard(input,directory);
  assert.equal(card.body.some(n=>n.id==='report-legend'),false);
  const json=JSON.stringify(card);
  assert.equal(json.includes('GHI CHÚ'),false);
  assert.equal(json.includes('Màu tím = ca sáng'),false);
  assert.equal(json.includes('Màu xanh ngọc = ca chiều'),false);
});

test('V20 contract is native, future-colored and external-resource-free',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);

  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V20_FUTURE_AVATAR_DETAILS');
  assert.equal(qa.data_gate,'passed');
  assert.deepEqual(qa.row_modules,['avatar','microsoft_native_chart']);
  assert.equal(qa.employee_row_module_count,2);
  assert.equal(qa.shift_mini_chart_count,8);
  assert.equal(qa.workday_mini_chart_count,0);
  assert.equal(qa.workday_summary_chart_count,1);
  assert.equal(qa.detail_interaction,'per_person_detail_button');
  assert.equal(qa.details_hidden_by_default,true);
  assert.equal(qa.repeated_shift_legends,false);
  assert.equal(qa.chart_category_label,'zero_width');
  assert.equal(qa.future_palette,'lightblue_cyan');
  assert.equal(qa.avatar_column_width,'32px');
  assert.equal(qa.footer_notes,false);
  assert.equal(qa.segment_legends_omitted,true);
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
