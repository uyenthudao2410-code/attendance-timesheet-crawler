import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT, buildNativeCard, auditCard, validateSource, sourceDigest,
  durationMinutes, hoursFromMinutes, chartHours, sessionMinutes, recordedMinutes, needsReconciliation, reconciliationSummary,
  chartName, workforceRecordedHoursChart, aggregateShiftMixChart,
  employeeCompactRow, statusStrip
} from '../src/attendance-native-card.mjs';

const input=JSON.parse(fs.readFileSync(process.env.NATIVE_TEST_SOURCE || 'test/fixtures/attendance-native-card-input.json','utf8'));
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

test('chart unit is hours while literal display remains h:mm',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(hoursFromMinutes(584),9.73);
  assert.equal(chartHours(584),9.7);
  assert.equal(chartHours(27),0.5);
  assert.equal(durationMinutes('Chưa chốt'),null);
});

test('recorded minutes sum only sessions with known duration',()=>{
  assert.equal(recordedMinutes(input.employees[0]),657);
  assert.equal(recordedMinutes(input.employees[2]),299);
  assert.equal(recordedMinutes(input.employees[6]),248);
  assert.deepEqual(sessionMinutes(input.employees[6].afternoon),[]);
  assert.equal(needsReconciliation(input.employees[0]),true);
  assert.equal(needsReconciliation(input.employees[1]),true);
  assert.equal(needsReconciliation(input.employees[2]),false);
  assert.equal(needsReconciliation(input.employees[6]),false);
});

test('main dashboard chart is one horizontal bar chart for all eight employees',()=>{
  const c=workforceRecordedHoursChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.showBarValues,true);
  assert.equal(c.data.length,8);
  assert.equal(c.data[0].x,'01 · Văn Mạnh');
  assert.equal(c.data[7].x,'08 · Đăng Hiếu');
  assert.equal(c.data[0].y,11);
  assert.equal(c.data[6].y,4.1);
  assert.equal(c.data[0].color,'attention');
  assert.equal(c.data[6].color,'warning');
  assert.equal(c.data[1].color,'attention');
  assert.equal(c.data[2].color,'good');
});

test('shift mix chart aggregates morning and afternoon in hours',()=>{
  const c=aggregateShiftMixChart(input);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.equal(c.showLegend,true);
  assert.equal(c.showBarValues,true);
  assert.equal(c.data.length,1);
  assert.equal(c.data[0].data.length,2);
  assert.equal(c.data[0].data[0].legend,'Ca sáng');
  assert.equal(c.data[0].data[1].legend,'Ca chiều');
  assert.ok(c.data[0].data[0].value>0);
  assert.ok(c.data[0].data[1].value>0);
});

test('status strip follows the derived over-8h reconciliation rule',()=>{
  assert.deepEqual(statusStrip(input).data[0].data.map(d=>[d.legend,d.value]),
    [['Trong ngưỡng',2],['Chưa chốt',1],['Cần đối soát >8h',5]]);
  assert.match(reconciliationSummary(input),/Điêu Văn Mạnh · 10h57/);
  assert.match(reconciliationSummary(input),/Nguyễn Thị Thục Anh · 9h44/);
  assert.ok(!reconciliationSummary(input).includes('Lê Thị Phương Linh'));
});

test('detail rows are easier to scan and preserve all literal employee fields',()=>{
  input.employees.forEach((e,i)=>{
    const block=employeeCompactRow(e,i);
    assert.equal(block.id,'employee-' + (i+1));
    assert.equal(block.items.length,3);
    assert.ok(JSON.stringify(block.items[1]).includes('☀  SÁNG'));
    assert.ok(JSON.stringify(block.items[2]).includes('◐  CHIỀU'));
    const json=JSON.stringify(block);
    for(const key of ['name','morning','afternoon','total','status']) assert.ok(json.includes(e[key]),i + ' ' + key);
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
  assert.equal(wide.items[0].columns.length,4);
  assert.deepEqual(wide.items[0].columns.map(c=>c.items[0].text),['8','8','6','5']);
});

test('card contains three separate dashboard charts and no per-person chart list',()=>{
  const card=buildNativeCard(input);
  const nodes=all(card);
  assert.equal(nodes.filter(n=>n.type==='Chart.HorizontalBar').length,1);
  assert.equal(nodes.filter(n=>n.type==='Chart.HorizontalBar.Stacked').length,2);
  assert.equal(nodes.filter(n=>n.type==='Table').length,0);
  assert.equal(all(card).filter(n=>/^employee-\d+$/.test(n.id||'')).length,8);
  assert.ok(!nodes.some(n=>/^employee-bar-/.test(n.id||'')));
});

test('details are hidden by default and opened by one toggle action',()=>{
  const card=buildNativeCard(input);
  const panel=card.body.find(n=>n.id==='attendance-details-panel');
  assert.ok(panel);
  assert.equal(panel.isVisible,false);
  assert.equal(panel.items.filter(n=>/^employee-\d+$/.test(n.id||'')).length,8);
  const action=all(card).find(n=>n.type==='Action.ToggleVisibility');
  assert.ok(action);
  assert.deepEqual(action.targetElements,['attendance-details-panel']);
  assert.match(action.title,/chi tiết giờ vào \/ ra/i);
  assert.equal(all(card).filter(n=>n.isVisible===false).length,1);
});

test('payload is native-only and minute labels are forbidden',()=>{
  const card=buildNativeCard(input);
  const qa=auditCard(card,input);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V9_ICONS_OVER8');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.employee_count,8);
  assert.equal(qa.table_count,0);
  assert.equal(qa.chart_count,3);
  assert.equal(qa.chart_unit,'hours');
  assert.equal(qa.external_chart_requests,0);
  assert.equal(qa.all_sessions_visible_by_default,false);
  assert.equal(qa.collapsible_detail_panel,true);
  assert.equal(qa.reconciliation_rule,'recorded_minutes_gt_480');
  assert.equal(qa.reconciliation_count,5);
  assert.ok(all(card).filter(n=>n.type==='Icon').length>=4);
  assert.ok(qa.bytes<27000);
  const json=JSON.stringify(card);
  assert.ok(!json.includes('Phút'));
  assert.ok(!json.includes('phút'));
  const main=card.body.find(n=>n.id==='workforce-recorded-hours');
  assert.equal(main.displayMode,'AbsoluteNoAxis');
  assert.equal(main.showBarValues,true);
});

test('mutating chart values or deleting literal shift line fails audit',()=>{
  const card=buildNativeCard(input);
  card.body.find(n=>n.id==='workforce-recorded-hours').data[0].y=99;
  assert.throws(()=>auditCard(card,input),/Layout\/data mismatch/);
  const removed=buildNativeCard(input);
  removed.body.find(n=>n.id==='attendance-details-panel').items.find(n=>n.id==='employee-6').items.pop();
  assert.throws(()=>auditCard(removed,input),/Layout\/data mismatch/);
});

test('external resources and duplicate IDs fail closed',()=>{
  const card=buildNativeCard(input);
  card.body.push({type:'Image',url:'https://example.com/chart.png'});
  assert.throws(()=>auditCard(card,input),/external visual/);
  const duplicate=buildNativeCard(input);
  const panel=duplicate.body.find(n=>n.id==='attendance-details-panel');
  duplicate.body.push(panel.items.find(n=>n.id==='employee-1'));
  assert.throws(()=>auditCard(duplicate,input),/Duplicate/);
});

test('incorrect KPI and incomplete roster fail closed',()=>{
  const changed=structuredClone(input);
  changed.kpis.closed=8;
  assert.throws(()=>buildNativeCard(changed),/KPI/);
  changed.employees.pop();
  assert.throws(()=>buildNativeCard(changed),/eight/);
});
