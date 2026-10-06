import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT, buildNativeCard, auditCard, validateSource, sourceDigest,
  durationMinutes, sessionMinutes, recordedMinutes, chartHours,
  workdaysFromMinutes, formatRecordedMinutes, formatWorkdays,
  chartName, workdayChart, hoursChart, aggregateShiftMixChart,
  statusStrip, mobileDetailsTable, wideDetailsTable
} from '../src/attendance-native-card.mjs';

const input=JSON.parse(fs.readFileSync(
  process.env.NATIVE_TEST_SOURCE || 'test/fixtures/attendance-native-card-input.json',
  'utf8'
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

test('fixture binding stays unchanged and source validates without mutation',()=>{
  const before=JSON.stringify(input);
  assert.equal(validateSource(input),input);
  assert.equal(sourceDigest(input),'cedcad7b9226d6009a0e516aa1fcb198cf8e715276a060831125fb9c30336f6e');
  buildNativeCard(input);
  assert.equal(JSON.stringify(input),before);
});

test('workday conversion is exactly 8 hours per workday',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(workdaysFromMinutes(584),1.22);
  assert.equal(workdaysFromMinutes(657),1.37);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
});

test('recorded time preserves all known sessions and open sessions add nothing',()=>{
  assert.equal(recordedMinutes(input.employees[0]),657);
  assert.equal(recordedMinutes(input.employees[1]),584);
  assert.equal(recordedMinutes(input.employees[5]),554);
  assert.equal(recordedMinutes(input.employees[6]),248);
  assert.deepEqual(sessionMinutes(input.employees[6].afternoon),[]);
});

test('workday chart is horizontal, colorful, mobile first, and value labels are shown',()=>{
  const c=workdayChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.id,'workforce-workdays-chart');
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.showBarValues,true);
  assert.equal(c.data.length,8);
  assert.equal(c.data[0].x,'01 · Văn Mạnh');
  assert.equal(c.data[7].x,'08 · Đăng Hiếu');
  assert.deepEqual(c.data.map(d=>d.y),[1.37,1.22,0.62,1.13,1,1.15,0.52,1.21]);
  assert.equal(new Set(c.data.map(d=>d.color)).size,8);
});

test('hour chart is a second horizontal view with the same employee order',()=>{
  const c=hoursChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.id,'workforce-hours-chart');
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.showBarValues,true);
  assert.deepEqual(c.data.map(d=>d.x),workdayChart(input).data.map(d=>d.x));
  assert.deepEqual(c.data.map(d=>d.y),[11,9.7,5,9,8,9.2,4.1,9.7]);
});

test('shift mix chart uses workdays and status strip stays neutral',()=>{
  const mix=aggregateShiftMixChart(input);
  assert.equal(mix.type,'Chart.HorizontalBar.Stacked');
  assert.deepEqual(mix.data[0].data.map(d=>[d.legend,d.value]),
    [['Ca sáng',3.34],['Ca chiều',4.88]]);

  assert.deepEqual(statusStrip(input).data[0].data.map(d=>[d.legend,d.value]),
    [['Đã ghi nhận',6],['Chưa chốt',2]]);
});

test('mobile details are one table row per employee with full data',()=>{
  const table=mobileDetailsTable(input);
  assert.equal(table.type,'Table');
  assert.equal(table.targetWidth,'atMost:Narrow');
  assert.equal(table.columns.length,2);
  assert.equal(table.rows.length,9);
  input.employees.forEach((e,i)=>{
    const row=table.rows[i+1];
    assert.equal(row.cells.length,2);
    const json=JSON.stringify(row);
    assert.ok(json.includes(e.name));
    assert.ok(json.includes(e.morning));
    assert.ok(json.includes(e.afternoon));
    assert.ok(json.includes('công'));
  });
  assert.ok(JSON.stringify(table.rows[1]).includes('10h57 · 1,37 công · Chưa chốt'));
});

test('wide details use one row per employee with four clear columns',()=>{
  const table=wideDetailsTable(input);
  assert.equal(table.type,'Table');
  assert.equal(table.targetWidth,'atLeast:Standard');
  assert.equal(table.columns.length,4);
  assert.equal(table.rows.length,9);
  assert.ok(table.rows.slice(1).every(r=>r.cells.length===4));
});

test('KPI layout remains responsive and neutral',()=>{
  const card=buildNativeCard(input);
  const mobile=card.body.find(n=>n.id==='kpi-mobile');
  const wide=card.body.find(n=>n.id==='kpi-wide');
  assert.equal(mobile.targetWidth,'atMost:Narrow');
  assert.equal(wide.targetWidth,'atLeast:Standard');
  assert.equal(mobile.items.length,2);
  assert.ok(mobile.items.every(r=>r.columns.length===2));
  assert.deepEqual(wide.items[0].columns.map(c=>c.items[0].text),['8','8','6','2']);
  assert.deepEqual(wide.items[0].columns.map(c=>c.items[1].text),
    ['Tổng nhân sự','Có dữ liệu','Đã chốt','Chưa chốt']);
});

test('chart view switch explicitly shows one view and hides the other',()=>{
  const card=buildNativeCard(input);
  const actionSet=card.body.find(n=>n.id==='chart-view-toggle');
  assert.ok(actionSet);
  assert.equal(actionSet.actions.length,2);
  assert.deepEqual(actionSet.actions[0].targetElements,[
    {elementId:'panel-workdays',isVisible:true},
    {elementId:'panel-hours',isVisible:false}
  ]);
  assert.deepEqual(actionSet.actions[1].targetElements,[
    {elementId:'panel-workdays',isVisible:false},
    {elementId:'panel-hours',isVisible:true}
  ]);
  assert.equal(card.body.find(n=>n.id==='panel-workdays').isVisible,true);
  assert.equal(card.body.find(n=>n.id==='panel-hours').isVisible,false);
});

test('details stay collapsed by default and include both mobile and wide tables',()=>{
  const card=buildNativeCard(input);
  const panel=card.body.find(n=>n.id==='attendance-details-panel');
  assert.ok(panel);
  assert.equal(panel.isVisible,false);
  assert.ok(panel.items.some(n=>n.id==='details-table-mobile'));
  assert.ok(panel.items.some(n=>n.id==='details-table-wide'));
  const action=all(card).find(n=>n.type==='Action.ToggleVisibility' && n.title==='Xem / Ẩn chi tiết (8)');
  assert.ok(action);
  assert.deepEqual(action.targetElements,['attendance-details-panel']);
});

test('payload matches V11 contract and uses only native resources',()=>{
  const card=buildNativeCard(input);
  const qa=auditCard(card,input);

  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V11_DUAL_VIEW_TABLE');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.employee_count,8);
  assert.equal(qa.table_count,2);
  assert.equal(qa.chart_count,4);
  assert.deepEqual(qa.chart_units,['workdays','hours']);
  assert.equal(qa.workday_conversion_minutes,480);
  assert.equal(qa.dual_chart_view,true);
  assert.equal(qa.collapsible_detail_panel,true);
  assert.equal(qa.mobile_detail_rows,8);
  assert.equal(qa.external_chart_requests,0);
  assert.ok(qa.bytes<27000);

  const json=JSON.stringify(card);
  for(const forbidden of ['Vượt 8h','Cần đối soát >8h','Đỏ: cần đối soát','quickchart','livegap']) {
    assert.ok(!json.includes(forbidden),forbidden);
  }
  assert.ok(all(card).filter(n=>n.type==='Icon').length>=3);
});

test('mutating a chart value or deleting a detail row fails audit',()=>{
  const card=buildNativeCard(input);
  card.body.find(n=>n.id==='panel-workdays').items
    .find(n=>n.id==='workforce-workdays-chart').data[0].y=99;
  assert.throws(()=>auditCard(card,input),/Layout\/data mismatch/);

  const removed=buildNativeCard(input);
  removed.body.find(n=>n.id==='attendance-details-panel').items
    .find(n=>n.id==='details-table-mobile').rows.pop();
  assert.throws(()=>auditCard(removed,input),/Layout\/data mismatch/);
});

test('external resources and duplicate IDs fail closed',()=>{
  const card=buildNativeCard(input);
  card.body.push({type:'Image',url:'https://example.com/chart.png'});
  assert.throws(()=>auditCard(card,input),/External or nonmobile visual/);

  const duplicate=buildNativeCard(input);
  duplicate.body.push(duplicate.body.find(n=>n.id==='panel-workdays'));
  assert.throws(()=>auditCard(duplicate,input),/Duplicate/);
});

test('incorrect KPI and incomplete roster fail closed',()=>{
  const changed=structuredClone(input);
  changed.kpis.closed=8;
  assert.throws(()=>buildNativeCard(changed),/KPI/);
  changed.employees.pop();
  assert.throws(()=>buildNativeCard(changed),/eight/);
});
