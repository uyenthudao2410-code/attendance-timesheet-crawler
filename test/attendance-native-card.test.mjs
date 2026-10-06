import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT, buildNativeCard, auditCard, validateSource, sourceDigest,
  durationMinutes, hoursFromMinutes, sessionMinutes, employeeSegmentsHours,
  employeeInlineBar, employeeInlineBlock, confirmedChart, statusStrip
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

test('chart geometry uses hours while literal display stays h:mm',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(hoursFromMinutes(584),9.73);
  assert.equal(hoursFromMinutes(27),0.45);
  assert.equal(durationMinutes('Chưa chốt'),null);
});

test('missing/open sessions never manufacture zero-valued chart facts',()=>{
  assert.deepEqual(sessionMinutes(input.employees[2].morning),[]);
  assert.deepEqual(sessionMinutes(input.employees[6].afternoon),[]);
  assert.equal(employeeSegmentsHours(input.employees[6]).length,1);
  assert.ok(!employeeSegmentsHours(input.employees[6]).some(d=>d.legend.startsWith('Chiều')));
});

test('Thanh Binh keeps every session separated in the inline bar',()=>{
  assert.deepEqual(employeeSegmentsHours(input.employees[5]).map(p=>p.value),[4.47,4.32,0.45]);
  assert.deepEqual(employeeSegmentsHours(input.employees[5]).map(p=>p.legend),['Sáng','Chiều','Chiều · phiên 2']);
});

test('each employee has one inline horizontal bar immediately followed by literal shift text',()=>{
  input.employees.forEach((e,i)=>{
    const block=employeeInlineBlock(e,i);
    assert.equal(block.id,'employee-' + (i+1));
    assert.equal(block.items.length,3);
    assert.equal(block.items[1].id,'employee-bar-' + (i+1));
    if (employeeSegmentsHours(e).length) assert.equal(block.items[1].type,'Chart.HorizontalBar.Stacked');
    const json=JSON.stringify(block);
    for(const key of ['name','morning','afternoon','total','status']) assert.ok(json.includes(e[key]),i + ' ' + key);
  });
});

test('inline bar contains hours-only session segments and no bar values',()=>{
  const bar=employeeInlineBar(input.employees[0],0);
  assert.equal(bar.type,'Chart.HorizontalBar.Stacked');
  assert.equal(bar.showLegend,false);
  assert.equal(bar.showBarValues,false);
  assert.deepEqual(bar.data[0].data.map(x=>x.value),[4.83,6.12]);
});

test('unclosed people never enter confirmed comparison',()=>{
  const c=confirmedChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.xAxisTitle,'Giờ');
  assert.deepEqual(c.data.map(d=>d.y),[9.73,4.98,9.03,7.98,9.23,9.7]);
  assert.ok(c.data.every(d=>!d.x.includes('Điêu Văn Mạnh') && !d.x.includes('Lê Thị Phương Linh')));
});

test('status strip remains compact and source-driven',()=>{
  assert.deepEqual(statusStrip(input).data[0].data.map(d=>[d.legend,d.value]),
    [['Đã ghi nhận',6],['Chưa chốt',1],['Cần đối soát',1]]);
});

test('KPI values remain one compact row',()=>{
  const strip=buildNativeCard(input).body.find(n=>n.id==='kpi-strip');
  assert.equal(strip.items[0].columns.length,4);
  assert.deepEqual(strip.items[0].columns.map(c=>c.items[0].text),['8','8','6','2']);
});

test('there is no duplicate detail table and all eight employee blocks stay visible',()=>{
  const card=buildNativeCard(input);
  const nodes=all(card);
  assert.equal(nodes.filter(n=>n.type==='Table').length,0);
  assert.equal(card.body.filter(n=>/^employee-\d+$/.test(n.id||'')).length,8);
  input.employees.forEach((_,i)=>{
    const block=card.body.find(n=>n.id==='employee-' + (i+1));
    assert.ok(block);
    assert.ok(!all(block).some(n=>n.isVisible===false));
  });
});

test('only the confirmed comparison is collapsed',()=>{
  const card=buildNativeCard(input);
  const panel=card.body.find(n=>n.id==='confirmed-panel');
  assert.equal(panel.isVisible,false);
  const action=all(card).find(n=>n.type==='Action.ToggleVisibility');
  assert.deepEqual(action.targetElements,['confirmed-panel']);
  assert.equal(all(card).filter(n=>n.isVisible===false).length,1);
});

test('payload is native-only and minute labels are forbidden',()=>{
  const card=buildNativeCard(input);
  const qa=auditCard(card,input);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V5_INLINE_BARS');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.employee_count,8);
  assert.equal(qa.table_count,0);
  assert.equal(qa.inline_employee_bar_count,8);
  assert.equal(qa.chart_unit,'hours');
  assert.equal(qa.external_chart_requests,0);
  assert.ok(qa.bytes<27000);
  const json=JSON.stringify(card);
  assert.ok(!json.includes('Phút'));
  assert.ok(!json.includes('phút'));
});

test('mutating a bar or deleting the literal time line fails audit',()=>{
  const card=buildNativeCard(input);
  card.body.find(n=>n.id==='employee-1').items[1].data[0].data[0].value=99;
  assert.throws(()=>auditCard(card,input),/Layout\/data mismatch/);
  const removed=buildNativeCard(input);
  removed.body.find(n=>n.id==='employee-6').items.pop();
  assert.throws(()=>auditCard(removed,input),/Layout\/data mismatch/);
});

test('external resources and duplicate IDs fail closed',()=>{
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
