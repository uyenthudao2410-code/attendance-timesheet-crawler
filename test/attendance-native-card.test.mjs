import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNativeCard, auditCard, validateSource, sourceDigest,
  durationMinutes, sessionMinutes, groupedShiftChart, employeeDetailTable, chartName
} from '../src/attendance-native-card.mjs';

const sourcePath = process.env.NATIVE_TEST_SOURCE || 'test/fixtures/attendance-native-card-input.json';
const input = JSON.parse(fs.readFileSync(sourcePath,'utf8'));

test('source fields validate against the 8-person fixture', () => {
  assert.equal(validateSource(input), input);
  assert.equal(sourceDigest(input), 'cedcad7b9226d6009a0e516aa1fcb198cf8e715276a060831125fb9c30336f6e');
});

test('duration conversion never rounds display values', () => {
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(durationMinutes('9h02'),542);
  assert.equal(durationMinutes('Chưa chốt'),null);
  assert.equal(durationMinutes('—'),null);
});

test('multiple sessions stay separate and an open session is absent, not zero', () => {
  assert.deepEqual(sessionMinutes(input.employees[5].afternoon),[259,27]);
  assert.deepEqual(sessionMinutes(input.employees[6].afternoon),[]);
});

test('chart labels use readable employee names instead of numeric STT only', () => {
  assert.equal(chartName('Điêu Văn Mạnh'),'Văn Mạnh');
  assert.equal(chartName('Nguyễn Thị Thục Anh'),'Thục Anh');
  assert.equal(chartName('Lê Thị Phương Linh'),'Phương Linh');
});

test('first mobile chart contains four employees with large readable name labels', () => {
  const c=groupedShiftChart(input,[0,1,2,3],true);
  assert.equal(c.type,'Chart.VerticalBar.Grouped');
  assert.equal(c.stacked,true);
  assert.equal(c.showLegend,true);
  const names=new Set(c.data.flatMap(v=>v.values.map(p=>p.x)));
  assert.deepEqual([...names].sort(),['Duy Hoàng','Thục Anh','Văn Mạnh','Đình Tuệ'].sort());
  assert.equal(names.size,4);
});

test('second chart keeps Thanh Bình second afternoon session separate', () => {
  const c=groupedShiftChart(input,[4,5,6,7],false);
  assert.equal(c.type,'Chart.VerticalBar.Grouped');
  assert.equal(c.showLegend,false);
  assert.equal(c.data.length,3);
  assert.deepEqual(c.data[2].values,[{x:'Thanh Bình',y:27}]);
});

test('each chart has a matching compact two-column detail table directly usable on mobile', () => {
  const a=employeeDetailTable(input,[0,1,2,3]);
  const b=employeeDetailTable(input,[4,5,6,7]);
  assert.equal(a.columns.length,2);
  assert.equal(b.columns.length,2);
  assert.equal(a.rows.length,4);
  assert.equal(b.rows.length,4);
  assert.ok(a.rows.every(r=>r.cells.length===2));
  assert.ok(b.rows.every(r=>r.cells.length===2));
  const json=JSON.stringify([a,b]);
  for (const e of input.employees) {
    for (const field of ['name','morning','afternoon','total','status']) assert.ok(json.includes(e[field]));
  }
});

test('native v2 card has two charts, two inline detail tables and responsive KPI layouts', () => {
  const before=JSON.stringify(input);
  const card=buildNativeCard(input);
  const qa=auditCard(card,input);
  assert.equal(JSON.stringify(input),before);
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.chart_count,2);
  assert.equal(qa.table_count,2);
  assert.equal(qa.external_chart_requests,0);
  assert.equal(qa.render_qa,'pending_designer_and_real_teams_clients');
  const json=JSON.stringify(card);
  assert.ok(json.includes('"targetWidth":"atLeast:Standard"'));
  assert.ok(json.includes('"targetWidth":"atMost:Narrow"'));
  assert.ok(json.includes('01–04 · NHÓM 1'));
  assert.ok(json.includes('05–08 · NHÓM 2'));
  for(const forbidden of ['quickchart','livegap','data:image','"color":"Light"','"isVisible.dynamic"']) assert.ok(!json.includes(forbidden));
});

test('mismatched KPI and incomplete roster fail closed', () => {
  const changed=structuredClone(input);
  changed.kpis.closed=8;
  assert.throws(()=>buildNativeCard(changed),/KPI/);
  changed.employees.pop();
  assert.throws(()=>buildNativeCard(changed),/eight/);
});
