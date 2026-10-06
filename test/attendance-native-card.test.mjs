import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT, buildNativeCard, auditCard, validateSource, sourceDigest,
  durationMinutes, sessionMinutes, employeeSegments, employeeShiftChart,
  employeeBlock, confirmedChart, statusStrip
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
test('duration conversion uses exact integer minutes, not rounded hours',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(durationMinutes('9h02'),542);
  assert.equal(durationMinutes('0h27'),27);
  assert.equal(durationMinutes('Chưa chốt'),null);
  assert.equal(durationMinutes('—'),null);
});
test('open sessions and absent shifts never manufacture zero-valued facts',()=>{
  assert.deepEqual(sessionMinutes(input.employees[2].morning),[]);
  assert.deepEqual(sessionMinutes(input.employees[6].afternoon),[]);
  assert.equal(employeeSegments(input.employees[6]).length,1);
  assert.ok(!employeeSegments(input.employees[6]).some(d=>d.legend.startsWith('Chiều')));
});
test('Thanh Binh retains all three source sessions without merging',()=>{
  assert.deepEqual(sessionMinutes(input.employees[5].afternoon),[259,27]);
  assert.deepEqual(employeeSegments(input.employees[5]).map(p=>p.value),[268,259,27]);
  assert.deepEqual(employeeSegments(input.employees[5]).map(p=>p.legend),['Sáng','Chiều','Chiều · phiên 2']);
});
test('each person has one inline native horizontal bar plus literal shifts',()=>{
  input.employees.forEach((e,i)=>{
    const block=employeeBlock(e,i), nodes=all(block);
    assert.equal(block.id,`employee-${i+1}`);
    const chart=nodes.filter(n=>n.type==='Chart.HorizontalBar.Stacked');
    assert.equal(chart.length,1);
    assert.equal(chart[0].showLegend,false);
    assert.deepEqual(chart[0].data[0].data,employeeSegments(e));
    const content=JSON.stringify(block);
    for(const k of ['name','morning','afternoon','total','status']) assert.ok(content.includes(e[k]),`${i} ${k}`);
    assert.ok(!nodes.some(n=>n.isVisible===false));
  });
});
test('repeated unclosed total and status is printed once, never replaced by partial hours',()=>{
  const e=input.employees[6], block=employeeBlock(e,6);
  assert.ok(!JSON.stringify(block).includes('Chưa chốt · Chưa chốt'));
  const runs=block.items[0].inlines;
  assert.equal(runs.at(-1).text,'Chưa chốt');
  assert.equal(employeeBlock(input.employees[0],0).items[0].inlines.at(-1).text,'Chưa chốt · Cần đối soát');
});
test('unconfirmed session sums never enter confirmed total comparison',()=>{
  const c=confirmedChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.deepEqual(c.data.map(d=>d.y),[584,299,542,479,554,582]);
  assert.ok(c.data.every(d=>!d.x.includes(input.employees[0].name) && !d.x.includes(input.employees[6].name)));
  input.employees.filter(e=>!e.attention).forEach(e=>assert.ok(c.data.some(d=>d.x===`${e.name} · ${e.total}`)));
});
test('status strip counts originate in source rather than hardcoded demo values',()=>{
  assert.deepEqual(statusStrip(input).data[0].data.map(d=>[d.legend,d.value]),
    [['Đã ghi nhận',6],['Chưa chốt',1],['Cần đối soát',1]]);
  const changed=structuredClone(input);
  changed.employees[6].status='Cần đối soát';
  assert.deepEqual(statusStrip(changed).data[0].data.map(d=>[d.legend,d.value]),
    [['Đã ghi nhận',6],['Cần đối soát',2]]);
});
test('source roster order stays fixed and no full-width duplicate table remains',()=>{
  const card=buildNativeCard(input);
  assert.deepEqual(card.body.filter(n=>/^employee-\d+$/.test(n.id||'')).map(n=>n.id),
    input.employees.map((_,i)=>`employee-${i+1}`));
  const nodes=all(card);
  assert.ok(!nodes.some(n=>n.type==='Table'||n.type.startsWith('Chart.Vertical')));
  assert.equal(nodes.filter(n=>n.type==='Chart.HorizontalBar').length,1);
  assert.equal(nodes.filter(n=>n.type==='Chart.HorizontalBar.Stacked').length,9);
});
test('four large KPI values use one compact row on all widths',()=>{
  const strip=buildNativeCard(input).body.find(n=>n.id==='kpi-strip');
  assert.equal(strip.items.length,1);
  assert.equal(strip.items[0].columns.length,4);
  assert.deepEqual(strip.items[0].columns.map(c=>c.items[0].text),['8','8','6','2']);
  assert.ok(strip.items[0].columns.every(c=>c.items[0].size==='ExtraLarge' && c.width===1));
  assert.ok(!('targetWidth' in strip));
});
test('optional comparison stays hidden; all eight employee details stay visible',()=>{
  const card=buildNativeCard(input);
  const panel=card.body.find(n=>n.id==='confirmed-panel');
  assert.equal(panel.isVisible,false);
  const action=all(card).find(n=>n.type==='Action.ToggleVisibility');
  assert.deepEqual(action.targetElements,['confirmed-panel']);
  assert.equal(all(card).filter(n=>n.isVisible===false).length,1);
  input.employees.forEach((e,i)=>{
    const block=card.body.find(n=>n.id===`employee-${i+1}`);
    assert.ok(block);
    assert.ok(!all(block).some(n=>n.isVisible===false || n.maxLines));
  });
});
test('payload budget and native-only audit pass while render QA remains pending',()=>{
  const qa=auditCard(buildNativeCard(input),input);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V3');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.employee_count,8);
  assert.equal(qa.table_count,0);
  assert.equal(qa.chart_count,10);
  assert.equal(qa.external_chart_requests,0);
  assert.equal(qa.all_sessions_visible_by_default,true);
  assert.ok(qa.bytes<27000);
  assert.equal(qa.render_qa,'pending_designer_and_real_teams_clients');
});
test('mutating chart values or deleting a field fails audit',()=>{
  const card=buildNativeCard(input);
  card.body.find(n=>n.id==='employee-1').items[1].data[0].data[0].value++;
  assert.throws(()=>auditCard(card,input),/Layout\/data mismatch/);
  const removed=buildNativeCard(input);
  removed.body.find(n=>n.id==='employee-6').items.pop();
  assert.throws(()=>auditCard(removed,input),/Layout\/data mismatch/);
});
test('external image resources and duplicate IDs fail closed',()=>{
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
test('no duration fallback does not draw a fictional segment',()=>{
  const e={...input.employees[6],morning:'—',afternoon:'13:28–—'};
  assert.deepEqual(employeeSegments(e),[]);
  assert.equal(employeeShiftChart(e,6).type,'TextBlock');
  assert.ok(JSON.stringify(employeeBlock(e,6)).includes('13:28–—'));
});
