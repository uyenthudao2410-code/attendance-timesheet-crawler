import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT, buildNativeCard, auditCard, validateSource, sourceDigest,
  durationMinutes, hoursFromMinutes, chartHours, workdaysFromMinutes,
  formatRecordedMinutes, formatWorkdays, sessionMinutes, recordedMinutes,
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

test('1 workday equals exactly 8 hours and formatting is Vietnamese-friendly',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(hoursFromMinutes(584),9.73);
  assert.equal(chartHours(584),9.7);
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(workdaysFromMinutes(584),1.22);
  assert.equal(workdaysFromMinutes(657),1.37);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
});

test('recorded minutes preserve overtime as normal recorded time',()=>{
  assert.equal(recordedMinutes(input.employees[0]),657);
  assert.equal(recordedMinutes(input.employees[1]),584);
  assert.equal(recordedMinutes(input.employees[5]),554);
  assert.equal(recordedMinutes(input.employees[6]),248);
  assert.deepEqual(sessionMinutes(input.employees[6].afternoon),[]);
});

test('main mobile chart shows workday equivalents directly on horizontal bars',()=>{
  const c=workforceRecordedHoursChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.id,'workforce-workdays-chart');
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.showBarValues,true);
  assert.equal(c.data.length,8);
  assert.equal(c.data[0].x,'01 · Văn Mạnh');
  assert.equal(c.data[7].x,'08 · Đăng Hiếu');
  assert.deepEqual(c.data.map(d=>d.y),[1.37,1.22,0.62,1.13,1,1.15,0.52,1.21]);
  assert.equal(c.data[0].color,'categoricalMarigold');
  assert.equal(c.data[1].color,'categoricalBlue');
  assert.equal(c.data[6].color,'categoricalMarigold');
});

test('shift mix chart is also expressed in workdays',()=>{
  const c=aggregateShiftMixChart(input);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.equal(c.showLegend,true);
  assert.equal(c.showBarValues,true);
  assert.deepEqual(c.data[0].data.map(d=>[d.legend,d.value]),
    [['Ca sáng',3.34],['Ca chiều',4.88]]);
});

test('status strip is neutral: recorded versus not closed only',()=>{
  assert.deepEqual(statusStrip(input).data[0].data.map(d=>[d.legend,d.value]),
    [['Đã ghi nhận',6],['Chưa chốt',2]]);
});

test('detail rows show recorded hours plus workday equivalent without overtime warnings',()=>{
  input.employees.forEach((e,i)=>{
    const block=employeeCompactRow(e,i);
    assert.equal(block.id,'employee-' + (i+1));
    assert.equal(block.items.length,3);
    const json=JSON.stringify(block);
    for(const key of ['name','morning','afternoon']) assert.ok(json.includes(e[key]),i + ' ' + key);
    assert.ok(json.includes('IconRun'));
    assert.ok(json.includes('SÁNG'));
    assert.ok(json.includes('CHIỀU'));
    assert.ok(json.includes('công'));
    assert.ok(!json.includes('Cần đối soát'));
  });
  assert.ok(JSON.stringify(employeeCompactRow(input.employees[0],0)).includes('10h57 · 1,37 công · Chưa chốt'));
  assert.ok(JSON.stringify(employeeCompactRow(input.employees[1],1)).includes('9h44 · 1,22 công · Đã ghi nhận'));
});

test('KPI layout remains 2x2 on mobile and neutral',()=>{
  const card=buildNativeCard(input);
  const mobile=card.body.find(n=>n.id==='kpi-mobile');
  const wide=card.body.find(n=>n.id==='kpi-wide');
  assert.equal(mobile.targetWidth,'atMost:Narrow');
  assert.equal(wide.targetWidth,'atLeast:Standard');
  assert.equal(mobile.items.length,2);
  assert.ok(mobile.items.every(r=>r.columns.length===2));
  assert.deepEqual(wide.items[0].columns.map(c=>c.items[0].text),['8','8','6','2']);
  assert.deepEqual(wide.items[0].columns.map(c=>c.items[1].text),['Tổng nhân sự','Có dữ liệu','Đã chốt','Chưa chốt']);
});

test('confirmed summary converts 50h40 to 6,33 workdays',()=>{
  const json=JSON.stringify(buildNativeCard(input));
  assert.ok(json.includes('50h40'));
  assert.ok(json.includes('6,33 công'));
  assert.ok(json.includes('1 công = 8 giờ'));
});

test('card contains three compact native charts and no per-person chart list',()=>{
  const card=buildNativeCard(input);
  const nodes=all(card);
  assert.equal(nodes.filter(n=>n.type==='Chart.HorizontalBar').length,1);
  assert.equal(nodes.filter(n=>n.type==='Chart.HorizontalBar.Stacked').length,2);
  assert.equal(nodes.filter(n=>n.type==='Table').length,0);
  assert.equal(nodes.filter(n=>/^employee-\d+$/.test(n.id||'')).length,8);
  assert.ok(!nodes.some(n=>/^employee-bar-/.test(n.id||'')));
});

test('details remain collapsed by default',()=>{
  const card=buildNativeCard(input);
  const panel=card.body.find(n=>n.id==='attendance-details-panel');
  assert.ok(panel);
  assert.equal(panel.isVisible,false);
  assert.equal(panel.items.filter(n=>/^employee-\d+$/.test(n.id||'')).length,8);
  const action=all(card).find(n=>n.type==='Action.ToggleVisibility');
  assert.ok(action);
  assert.deepEqual(action.targetElements,['attendance-details-panel']);
  assert.match(action.title,/chi tiết giờ vào \/ ra/i);
});

test('payload is mobile-first, native-only, and has no overtime alarm language',()=>{
  const card=buildNativeCard(input);
  const qa=auditCard(card,input);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V10_WORKDAYS');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.employee_count,8);
  assert.equal(qa.table_count,0);
  assert.equal(qa.chart_count,3);
  assert.equal(qa.chart_unit,'workdays');
  assert.equal(qa.workday_conversion_minutes,480);
  assert.equal(qa.external_chart_requests,0);
  assert.equal(qa.all_sessions_visible_by_default,false);
  assert.equal(qa.collapsible_detail_panel,true);
  assert.ok(all(card).filter(n=>n.type==='Icon').length>=3);
  assert.ok(all(card).filter(n=>n.type==='IconRun').length>=18);
  assert.ok(qa.bytes<27000);
  const json=JSON.stringify(card);
  for(const forbidden of ['Vượt 8h','Cần đối soát >8h','Đỏ: cần đối soát','needsReconciliation']) {
    assert.ok(!json.includes(forbidden),forbidden);
  }
  const main=card.body.find(n=>n.id==='workforce-workdays-chart');
  assert.equal(main.displayMode,'AbsoluteNoAxis');
  assert.equal(main.showBarValues,true);
});

test('mutating chart values or deleting a shift line fails audit',()=>{
  const card=buildNativeCard(input);
  card.body.find(n=>n.id==='workforce-workdays-chart').data[0].y=99;
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
