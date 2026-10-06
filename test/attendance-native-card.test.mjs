import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT, buildNativeCard, auditCard, validateSource, sourceDigest,
  durationMinutes, hoursFromMinutes, sessionMinutes, employeeSegmentsHours,
  workforceHoursChart, employeeDetail, confirmedChart, statusStrip
} from '../src/attendance-native-card.mjs';

const input=JSON.parse(fs.readFileSync(process.env.NATIVE_TEST_SOURCE || 'test/fixtures/attendance-native-card-input.json','utf8'));
const all = root => {
  const result=[];
  const walk=v=>{
    if(!v || typeof v!=='object') return;
    if(v.type) result.push(v);
    Object.values(v).forEach(walk);
  };
  walk(root);
  return result;
};

test('fixture binding stays unchanged and source is validated without mutation',()=>{
  const before=JSON.stringify(input);
  assert.equal(validateSource(input),input);
  assert.equal(sourceDigest(input),'cedcad7b9226d6009a0e516aa1fcb198cf8e715276a060831125fb9c30336f6e');
  buildNativeCard(input);
  assert.equal(JSON.stringify(input),before);
});

test('duration parser remains exact while chart unit is hours',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(hoursFromMinutes(584),9.73);
  assert.equal(hoursFromMinutes(27),0.45);
  assert.equal(durationMinutes('Chưa chốt'),null);
  assert.equal(durationMinutes('—'),null);
});

test('open sessions and absent shifts never manufacture zero-valued facts',()=>{
  assert.deepEqual(sessionMinutes(input.employees[2].morning),[]);
  assert.deepEqual(sessionMinutes(input.employees[6].afternoon),[]);
  assert.equal(employeeSegmentsHours(input.employees[6]).length,1);
  assert.ok(!employeeSegmentsHours(input.employees[6]).some(d=>d.legend.startsWith('Chiều')));
});

test('Thanh Binh retains all source sessions as separate hour segments',()=>{
  assert.deepEqual(sessionMinutes(input.employees[5].afternoon),[259,27]);
  assert.deepEqual(employeeSegmentsHours(input.employees[5]).map(p=>p.value),[4.47,4.32,0.45]);
  assert.deepEqual(employeeSegmentsHours(input.employees[5]).map(p=>p.legend),['Sáng','Chiều','Chiều · phiên 2']);
});

test('main workforce chart is one horizontal stacked chart for all eight people',()=>{
  const c=workforceHoursChart(input);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.equal(c.xAxisTitle,'Giờ');
  assert.equal(c.showLegend,true);
  assert.equal(c.data.length,8);
  assert.equal(c.data[0].title,'01 · Văn Mạnh');
  assert.equal(c.data[7].title,'08 · Đăng Hiếu');
  assert.deepEqual(c.data[0].data.map(x=>x.value),[4.83,6.12]);
});

test('each employee detail stays compact but preserves every literal field',()=>{
  input.employees.forEach((e,i)=>{
    const block=employeeDetail(e,i);
    assert.equal(block.id,'employee-' + (i+1));
    assert.equal(block.items.length,2);
    const json=JSON.stringify(block);
    for(const key of ['name','morning','afternoon','total','status']) {
      assert.ok(json.includes(e[key]),i + ' ' + key);
    }
  });
});

test('unclosed totals are not converted into confirmed hours',()=>{
  const c=confirmedChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.xAxisTitle,'Giờ đã chốt');
  assert.deepEqual(c.data.map(d=>d.y),[9.73,4.98,9.03,7.98,9.23,9.7]);
  assert.ok(c.data.every(d=>!d.x.includes('Văn Mạnh') && !d.x.includes('Phương Linh')));
});

test('status strip counts originate in source',()=>{
  assert.deepEqual(statusStrip(input).data[0].data.map(d=>[d.legend,d.value]),
    [['Đã ghi nhận',6],['Chưa chốt',1],['Cần đối soát',1]]);
});

test('KPI values remain one compact row',()=>{
  const strip=buildNativeCard(input).body.find(n=>n.id==='kpi-strip');
  assert.equal(strip.items.length,1);
  assert.equal(strip.items[0].columns.length,4);
  assert.deepEqual(strip.items[0].columns.map(c=>c.items[0].text),['8','8','6','2']);
  assert.ok(strip.items[0].columns.every(c=>c.items[0].size==='ExtraLarge'));
});

test('only one default employee chart remains; no long duplicate table or per-person chart list',()=>{
  const card=buildNativeCard(input);
  const nodes=all(card);
  assert.equal(nodes.filter(n=>n.type==='Chart.HorizontalBar.Stacked').length,2);
  assert.equal(nodes.filter(n=>n.type==='Chart.HorizontalBar').length,1);
  assert.equal(nodes.filter(n=>n.type==='Table').length,0);
  assert.equal(card.body.filter(n=>/^employee-\d+$/.test(n.id||'')).length,8);
});

test('confirmed comparison is optional while all employee details are visible',()=>{
  const card=buildNativeCard(input);
  const panel=card.body.find(n=>n.id==='confirmed-panel');
  assert.equal(panel.isVisible,false);
  const action=all(card).find(n=>n.type==='Action.ToggleVisibility');
  assert.deepEqual(action.targetElements,['confirmed-panel']);
  input.employees.forEach((e,i)=>{
    const block=card.body.find(n=>n.id==='employee-' + (i+1));
    assert.ok(block);
    assert.ok(!all(block).some(n=>n.isVisible===false));
  });
});

test('payload is native-only and all chart labels are hour-based',()=>{
  const card=buildNativeCard(input);
  const qa=auditCard(card,input);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V4_HOURS');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.employee_count,8);
  assert.equal(qa.table_count,0);
  assert.equal(qa.chart_count,3);
  assert.equal(qa.chart_unit,'hours');
  assert.equal(qa.external_chart_requests,0);
  assert.ok(qa.bytes<27000);
  const json=JSON.stringify(card);
  assert.ok(json.includes('"xAxisTitle":"Giờ"'));
  assert.ok(json.includes('"xAxisTitle":"Giờ đã chốt"'));
  assert.ok(!json.includes('Phút'));
  assert.ok(!json.includes('phút'));
});

test('mutating chart values or deleting a literal field fails audit',()=>{
  const card=buildNativeCard(input);
  const chart=card.body.find(n=>n.id==='workforce-hours-chart');
  chart.data[0].data[0].value=99;
  assert.throws(()=>auditCard(card,input),/Layout\/data mismatch/);
  const removed=buildNativeCard(input);
  removed.body.find(n=>n.id==='employee-6').items.pop();
  assert.throws(()=>auditCard(removed,input),/Layout\/data mismatch/);
});

test('external visual resources and duplicate IDs fail closed',()=>{
  const card=buildNativeCard(input);
  card.body.push({type:'Image',url:'https://example.com/chart.png'});
  assert.throws(()=>auditCard(card,input),/external visual/);
  const duplicate=buildNativeCard(input);
  duplicate.body.push(duplicate.body.find(n=>n.id==='employee-1'));
  assert.throws(()=>auditCard(duplicate,input),/Duplicate/);
});

test('incorrect KPI and incomplete roster fail closed',()=>{
  const changed=structuredClone(input);
  changed.kpis.closed=8;
  assert.throws(()=>buildNativeCard(changed),/KPI/);
  changed.employees.pop();
  assert.throws(()=>buildNativeCard(changed),/eight/);
});
