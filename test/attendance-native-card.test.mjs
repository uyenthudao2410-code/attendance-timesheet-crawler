import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT, buildNativeCard, auditCard, validateSource, sourceDigest,
  durationMinutes, sessionMinutes, recordedMinutes, chartHours,
  workdaysFromMinutes, formatRecordedMinutes, formatWorkdays,
  chartName, workdayChart, aggregateShiftMixChart, statusStrip,
  compactDetailsTable, shiftChartCreatePayload
} from '../src/attendance-native-card.mjs';

const input=JSON.parse(fs.readFileSync(
  process.env.NATIVE_TEST_SOURCE || 'test/fixtures/attendance-native-card-input.json',
  'utf8'
));
const SHIFT_URL='https://quickchart.io/chart/render/test-v12-shifts';

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
  buildNativeCard(input,SHIFT_URL);
  assert.equal(JSON.stringify(input),before);
});

test('1 workday equals exactly 8 hours',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(workdaysFromMinutes(584),1.22);
  assert.equal(workdaysFromMinutes(657),1.37);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
});

test('recorded time preserves all known sessions and ignores open-ended duration',()=>{
  assert.equal(recordedMinutes(input.employees[0]),657);
  assert.equal(recordedMinutes(input.employees[1]),584);
  assert.equal(recordedMinutes(input.employees[5]),554);
  assert.equal(recordedMinutes(input.employees[6]),248);
  assert.deepEqual(sessionMinutes(input.employees[6].afternoon),[]);
});

test('stacked shift chart uses Chart.js v4 and overlays name plus shift duration inside bars',()=>{
  const p=shiftChartCreatePayload(input);
  assert.equal(p.version,'4');
  assert.equal(p.width,1100);
  assert.equal(p.height,760);
  assert.equal(p.devicePixelRatio,2);
  assert.equal(typeof p.chart,'string');
  assert.ok(p.chart.includes("indexAxis:'y'"));
  assert.ok(p.chart.includes("stacked:true"));
  assert.ok(p.chart.includes("ticks:{display:false}"));
  assert.ok(p.chart.includes("labels:{"));
  assert.ok(p.chart.includes("name:{"));
  assert.ok(p.chart.includes("shift:{"));
  assert.ok(p.chart.includes("return [ctx.dataset._names[i],shiftLabel]"));
  assert.ok(p.chart.includes('"01 · Văn Mạnh"'));
  assert.ok(p.chart.includes('"S 4h50"'));
  assert.ok(p.chart.includes('"C 6h07"'));
  assert.ok(p.chart.includes('"C 4h59"'));
  assert.ok(p.chart.includes('"C 4h46"'));
});

test('native workday alternate view remains available',()=>{
  const c=workdayChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.showBarValues,true);
  assert.deepEqual(c.data.map(d=>d.y),[1.37,1.22,0.62,1.13,1,1.15,0.52,1.21]);
});

test('secondary indicators remain concise and neutral',()=>{
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
  const card=buildNativeCard(input,SHIFT_URL);
  const mobile=card.body.find(n=>n.id==='kpi-mobile');
  const wide=card.body.find(n=>n.id==='kpi-wide');
  assert.equal(mobile.targetWidth,'atMost:Narrow');
  assert.equal(wide.targetWidth,'atLeast:Standard');
  assert.equal(mobile.items.length,2);
  assert.ok(mobile.items.every(r=>r.columns.length===2));
  assert.deepEqual(wide.items[0].columns.map(c=>c.items[0].text),['8','8','6','2']);
});

test('default chart view is stacked shifts and button switches to workdays',()=>{
  const card=buildNativeCard(input,SHIFT_URL);
  const actionSet=card.body.find(n=>n.id==='chart-view-toggle');
  assert.equal(actionSet.actions[0].title,'Theo ca');
  assert.equal(actionSet.actions[1].title,'Công quy đổi');
  assert.deepEqual(actionSet.actions[0].targetElements,[
    {elementId:'panel-shifts',isVisible:true},
    {elementId:'panel-workdays',isVisible:false}
  ]);
  assert.deepEqual(actionSet.actions[1].targetElements,[
    {elementId:'panel-shifts',isVisible:false},
    {elementId:'panel-workdays',isVisible:true}
  ]);
  const shifts=card.body.find(n=>n.id==='panel-shifts');
  assert.equal(shifts.isVisible,true);
  const image=shifts.items.find(n=>n.id==='shift-overlay-chart');
  assert.equal(image.type,'Image');
  assert.equal(image.url,SHIFT_URL);
  assert.equal(card.body.find(n=>n.id==='panel-workdays').isVisible,false);
});

test('details stay collapsed by default',()=>{
  const card=buildNativeCard(input,SHIFT_URL);
  const panel=card.body.find(n=>n.id==='attendance-details-panel');
  assert.equal(panel.isVisible,false);
  assert.ok(panel.items.some(n=>n.id==='details-table-compact'));
  const action=all(card).find(n=>n.type==='Action.ToggleVisibility' && n.title==='Xem / Ẩn chi tiết (8)');
  assert.ok(action);
});

test('payload matches V12 hybrid contract and only allows QuickChart render image',()=>{
  const card=buildNativeCard(input,SHIFT_URL);
  const qa=auditCard(card,input,SHIFT_URL);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_HYBRID_V12_STACKED_SHIFTS');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.table_count,1);
  assert.equal(qa.chart_count,3);
  assert.deepEqual(qa.chart_units,['stacked_shift_hours','workdays']);
  assert.equal(qa.workday_conversion_minutes,480);
  assert.equal(qa.dual_chart_view,true);
  assert.equal(qa.shift_chart_name_overlay,true);
  assert.equal(qa.shift_chart_stacked,true);
  assert.equal(qa.external_chart_requests,1);
  assert.equal(qa.external_chart_provider,'quickchart.io');
  assert.ok(qa.bytes<27000);
});

test('mutating chart data or detail rows fails audit',()=>{
  const card=buildNativeCard(input,SHIFT_URL);
  card.body.find(n=>n.id==='panel-workdays').items
    .find(n=>n.id==='workforce-workdays-chart').data[0].y=99;
  assert.throws(()=>auditCard(card,input,SHIFT_URL),/Layout\/data mismatch/);

  const removed=buildNativeCard(input,SHIFT_URL);
  removed.body.find(n=>n.id==='attendance-details-panel').items
    .find(n=>n.id==='details-table-compact').rows.pop();
  assert.throws(()=>auditCard(removed,input,SHIFT_URL),/Layout\/data mismatch/);
});

test('non-QuickChart external image fails closed',()=>{
  const card=buildNativeCard(input,SHIFT_URL);
  card.body.find(n=>n.id==='panel-shifts').items
    .find(n=>n.id==='shift-overlay-chart').url='https://example.com/chart.png';
  assert.throws(()=>auditCard(card,input,SHIFT_URL),/QuickChart/);
});

test('incorrect KPI and incomplete roster fail closed',()=>{
  const changed=structuredClone(input);
  changed.kpis.closed=8;
  assert.throws(()=>buildNativeCard(changed,SHIFT_URL),/KPI/);
  changed.employees.pop();
  assert.throws(()=>buildNativeCard(changed,SHIFT_URL),/eight/);
});
