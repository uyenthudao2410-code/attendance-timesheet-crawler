import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT, buildNativeCard, auditCard, validateSource, validateDirectory, sourceDigest,
  durationMinutes, sessionMinutes, recordedMinutes, shiftTotalMinutes,
  chartHours, workdaysFromMinutes, formatRecordedMinutes, formatWorkdays,
  nativeShiftChart, workdayChart, shiftDonut, statusDonut,
  compactDetailsTable, personaSet
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

test('source and Entra directory are fully bound without mutation',()=>{
  const before=JSON.stringify(input);
  assert.equal(validateSource(input),input);
  assert.equal(validateDirectory(input,directory),directory);
  assert.equal(sourceDigest(input),'cedcad7b9226d6009a0e516aa1fcb198cf8e715276a060831125fb9c30336f6e');
  buildNativeCard(input,directory);
  assert.equal(JSON.stringify(input),before);
  assert.equal(Object.keys(directory).length,8);
});

test('all eight employees have exact Microsoft Entra identities',()=>{
  for(const e of input.employees){
    const u=directory[e.name];
    assert.ok(u);
    assert.equal(u.displayName,e.name);
    assert.match(u.id,/^[0-9a-f-]{36}$/i);
    assert.match(u.userPrincipalName,/@stacorp\.net$/);
  }
});

test('workday conversion and recorded durations stay exact',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(workdaysFromMinutes(584),1.22);
  assert.equal(workdaysFromMinutes(657),1.37);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
});

test('native shift chart keeps morning and afternoon on the same employee row',()=>{
  const c=nativeShiftChart(input);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.equal(c.showBarValues,true);
  assert.equal(c.data.length,8);
  assert.deepEqual(c.data[0],{
    title:'01 · Văn Mạnh',
    data:[
      {legend:'Ca sáng',value:4.8,color:'categoricalBlue'},
      {legend:'Ca chiều',value:6.1,color:'categoricalTeal'}
    ]
  });
  assert.deepEqual(c.data[2].data,[
    {legend:'Ca chiều',value:5,color:'categoricalTeal'}
  ]);
  assert.deepEqual(c.data[6].data,[
    {legend:'Ca sáng',value:4.1,color:'categoricalBlue'}
  ]);
});

test('alternate workday chart remains colorful and compact',()=>{
  const c=workdayChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.showBarValues,true);
  assert.deepEqual(c.data.map(d=>d.y),[1.37,1.22,0.62,1.13,1,1.15,0.52,1.21]);
  assert.equal(new Set(c.data.map(d=>d.color)).size,8);
});

test('quick insights use two native donut concepts',()=>{
  const shift=shiftDonut(input);
  const status=statusDonut(input);
  assert.equal(shift.type,'Chart.Donut');
  assert.equal(status.type,'Chart.Donut');
  assert.equal(shift.colorSet,'categorical');
  assert.equal(status.colorSet,'categorical');
  assert.deepEqual(shift.data.map(d=>d.value),[3.34,4.88]);
  assert.deepEqual(status.data.map(d=>d.value),[6,2]);
  assert.match(shift.data[0].legend,/Ca sáng · 3,34 công/);
  assert.match(status.data[1].legend,/Chưa chốt · 2/);
});

test('PersonaSet contains all eight exact Entra users',()=>{
  const p=personaSet(input,directory);
  assert.equal(p.type,'Component');
  assert.equal(p.name,'graph.microsoft.com/users');
  assert.equal(p.view,'compact');
  assert.equal(p.properties.users.length,8);
  assert.equal(p.properties.users[0].id,'b48a45af-1984-44be-9ec8-93df9a2a95f9');
  assert.equal(p.properties.users[0].userPrincipalName,'vanmanh@stacorp.net');
});

test('compact details use one Persona plus attendance data per employee row',()=>{
  const table=compactDetailsTable(input,directory);
  assert.equal(table.type,'Table');
  assert.equal(table.columns.length,2);
  assert.equal(table.rows.length,9);
  input.employees.forEach((e,i)=>{
    const row=table.rows[i+1];
    const persona=row.cells[0].items[0];
    assert.equal(persona.type,'Component');
    assert.equal(persona.name,'graph.microsoft.com/user');
    assert.equal(persona.properties.id,directory[e.name].id);
    const json=JSON.stringify(row);
    assert.ok(json.includes(e.morning));
    assert.ok(json.includes(e.afternoon));
    assert.ok(json.includes('công'));
  });
});

test('mobile quick insights stack donuts while desktop places them side by side',()=>{
  const card=buildNativeCard(input,directory);
  const mobile=card.body.find(n=>n.id==='quick-mobile');
  const wide=card.body.find(n=>n.id==='quick-wide');
  assert.equal(mobile.targetWidth,'atMost:Narrow');
  assert.equal(wide.targetWidth,'atLeast:Standard');
  assert.equal(all(mobile).filter(n=>n.type==='Chart.Donut').length,2);
  assert.equal(all(wide).filter(n=>n.type==='Chart.Donut').length,2);
  assert.equal(wide.columns.length,2);
});

test('default view remains stacked shifts and details remain collapsed',()=>{
  const card=buildNativeCard(input,directory);
  assert.equal(card.body.find(n=>n.id==='panel-shifts').isVisible,true);
  assert.equal(card.body.find(n=>n.id==='panel-workdays').isVisible,false);
  assert.equal(card.body.find(n=>n.id==='attendance-details-panel').isVisible,false);
  const actions=all(card).filter(n=>n.type==='Action.ToggleVisibility');
  assert.ok(actions.some(a=>a.title==='Theo ca'));
  assert.ok(actions.some(a=>a.title==='Công quy đổi'));
  assert.ok(actions.some(a=>a.title==='Xem / Ẩn chi tiết (8)'));
});

test('V14 card is Microsoft-native with donuts and personas, no external images',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V14_DONUT_PERSONA');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.table_count,1);
  assert.equal(qa.chart_count,6);
  assert.equal(qa.donut_count,4);
  assert.equal(qa.persona_component_count,9);
  assert.equal(qa.native_microsoft_charts_only,true);
  assert.equal(qa.native_microsoft_personas,true);
  assert.equal(qa.external_chart_requests,0);
  assert.ok(qa.bytes<27000);
  assert.equal(all(card).filter(n=>n.type==='Image').length,0);
  assert.equal(JSON.stringify(card).includes('quickchart'),false);
});

test('mutating a chart or Persona directory binding fails audit',()=>{
  const card=buildNativeCard(input,directory);
  card.body.find(n=>n.id==='panel-shifts').items
    .find(n=>n.id==='workforce-shifts-chart').data[0].data[0].value=99;
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
