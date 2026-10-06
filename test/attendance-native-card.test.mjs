import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT, buildNativeCard, auditCard, validateSource, sourceDigest,
  durationMinutes, sessionMinutes, recordedMinutes, shiftTotalMinutes,
  chartHours, workdaysFromMinutes, formatRecordedMinutes, formatWorkdays,
  nativeShiftChart, workdayChart, aggregateShiftMixChart, statusStrip,
  compactDetailsTable
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

test('workday conversion and recorded durations stay exact',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(workdaysFromMinutes(584),1.22);
  assert.equal(workdaysFromMinutes(657),1.37);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
});

test('shift totals preserve all known sessions and ignore open-ended session duration',()=>{
  assert.equal(shiftTotalMinutes(input.employees[0],'morning'),290);
  assert.equal(shiftTotalMinutes(input.employees[0],'afternoon'),367);
  assert.equal(shiftTotalMinutes(input.employees[5],'afternoon'),286);
  assert.equal(shiftTotalMinutes(input.employees[6],'afternoon'),0);
  assert.equal(recordedMinutes(input.employees[6]),248);
  assert.deepEqual(sessionMinutes(input.employees[6].afternoon),[]);
});

test('Microsoft native stacked chart has one row per employee and morning plus afternoon on same row',()=>{
  const c=nativeShiftChart(input);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.equal(c.id,'workforce-shifts-chart');
  assert.equal(c.showLegend,true);
  assert.equal(c.showBarValues,true);
  assert.equal(c.xAxisTitle,'Giờ');
  assert.equal(c.data.length,8);

  const manh=c.data[0];
  assert.equal(manh.title,'01 · Văn Mạnh');
  assert.deepEqual(manh.data,[
    {legend:'Ca sáng',value:4.8,color:'categoricalBlue'},
    {legend:'Ca chiều',value:6.1,color:'categoricalTeal'}
  ]);

  const tue=c.data[2];
  assert.equal(tue.title,'03 · Đình Tuệ');
  assert.deepEqual(tue.data,[
    {legend:'Ca chiều',value:5,color:'categoricalTeal'}
  ]);

  const linh=c.data[6];
  assert.equal(linh.title,'07 · Phương Linh');
  assert.deepEqual(linh.data,[
    {legend:'Ca sáng',value:4.1,color:'categoricalBlue'}
  ]);
});

test('native workday alternate view remains available',()=>{
  const c=workdayChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.showBarValues,true);
  assert.deepEqual(c.data.map(d=>d.y),[1.37,1.22,0.62,1.13,1,1.15,0.52,1.21]);
});

test('secondary indicators remain native, concise and neutral',()=>{
  const mix=aggregateShiftMixChart(input);
  assert.equal(mix.type,'Chart.HorizontalBar.Stacked');
  assert.deepEqual(mix.data[0].data.map(d=>[d.legend,d.value]),
    [['Ca sáng',3.34],['Ca chiều',4.88]]);
  assert.deepEqual(statusStrip(input).data[0].data.map(d=>[d.legend,d.value]),
    [['Đã ghi nhận',6],['Chưa chốt',2]]);
});

test('compact details table is one row per employee',()=>{
  const table=compactDetailsTable(input);
  assert.equal(table.type,'Table');
  assert.equal(table.id,'details-table-compact');
  assert.equal(table.columns.length,2);
  assert.equal(table.rows.length,9);
  input.employees.forEach((e,i)=>{
    const row=table.rows[i+1];
    const json=JSON.stringify(row);
    assert.ok(json.includes(e.name));
    assert.ok(json.includes(e.morning));
    assert.ok(json.includes(e.afternoon));
    assert.ok(json.includes('công'));
  });
});

test('KPI layout is mobile-first 2x2 and wide 4-across',()=>{
  const card=buildNativeCard(input);
  const mobile=card.body.find(n=>n.id==='kpi-mobile');
  const wide=card.body.find(n=>n.id==='kpi-wide');
  assert.equal(mobile.targetWidth,'atMost:Narrow');
  assert.equal(wide.targetWidth,'atLeast:Standard');
  assert.equal(mobile.items.length,2);
  assert.ok(mobile.items.every(r=>r.columns.length===2));
  assert.deepEqual(wide.items[0].columns.map(c=>c.items[0].text),['8','8','6','2']);
});

test('default view is native stacked shifts and button switches to workdays',()=>{
  const card=buildNativeCard(input);
  const actionSet=card.body.find(n=>n.id==='chart-view-toggle');
  assert.equal(actionSet.actions[0].title,'Theo ca');
  assert.equal(actionSet.actions[1].title,'Công quy đổi');
  assert.deepEqual(actionSet.actions[0].targetElements,[
    {elementId:'panel-shifts',isVisible:true},
    {elementId:'panel-workdays',isVisible:false}
  ]);
  const shifts=card.body.find(n=>n.id==='panel-shifts');
  assert.equal(shifts.isVisible,true);
  assert.ok(shifts.items.some(n=>n.id==='workforce-shifts-chart'));
  assert.equal(card.body.find(n=>n.id==='panel-workdays').isVisible,false);
});

test('details stay collapsed by default',()=>{
  const card=buildNativeCard(input);
  const panel=card.body.find(n=>n.id==='attendance-details-panel');
  assert.equal(panel.isVisible,false);
  assert.ok(panel.items.some(n=>n.id==='details-table-compact'));
  const action=all(card).find(n=>n.type==='Action.ToggleVisibility' && n.title==='Xem / Ẩn chi tiết (8)');
  assert.ok(action);
});

test('V13 is 100 percent Microsoft native with no Image or external URL',()=>{
  const card=buildNativeCard(input);
  const qa=auditCard(card,input);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V13_STACKED_SHIFTS');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.table_count,1);
  assert.equal(qa.chart_count,4);
  assert.deepEqual(qa.chart_units,['stacked_shift_hours','workdays']);
  assert.equal(qa.workday_conversion_minutes,480);
  assert.equal(qa.dual_chart_view,true);
  assert.equal(qa.shift_chart_stacked,true);
  assert.equal(qa.native_microsoft_charts_only,true);
  assert.equal(qa.external_chart_requests,0);
  assert.ok(qa.bytes<27000);

  const nodes=all(card);
  assert.equal(nodes.filter(n=>n.type==='Image').length,0);
  assert.equal(JSON.stringify(card).includes('quickchart'),false);
  assert.equal(JSON.stringify(card).includes('http'),true);
});

test('mutating native chart data or detail rows fails audit',()=>{
  const card=buildNativeCard(input);
  card.body.find(n=>n.id==='panel-shifts').items
    .find(n=>n.id==='workforce-shifts-chart').data[0].data[0].value=99;
  assert.throws(()=>auditCard(card,input),/Layout\/data mismatch/);

  const removed=buildNativeCard(input);
  removed.body.find(n=>n.id==='attendance-details-panel').items
    .find(n=>n.id==='details-table-compact').rows.pop();
  assert.throws(()=>auditCard(removed,input),/Layout\/data mismatch/);
});

test('external images and duplicate IDs fail closed',()=>{
  const card=buildNativeCard(input);
  card.body.push({type:'Image',url:'https://example.com/chart.png'});
  assert.throws(()=>auditCard(card,input),/External or nonmobile visual/);

  const duplicate=buildNativeCard(input);
  duplicate.body.push(duplicate.body.find(n=>n.id==='panel-shifts'));
  assert.throws(()=>auditCard(duplicate,input),/Duplicate/);
});

test('incorrect KPI and incomplete roster fail closed',()=>{
  const changed=structuredClone(input);
  changed.kpis.closed=8;
  assert.throws(()=>buildNativeCard(changed),/KPI/);
  changed.employees.pop();
  assert.throws(()=>buildNativeCard(changed),/eight/);
});
