import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNativeCard, auditCard, validateSource, sourceDigest,
  durationMinutes, sessionMinutes, confirmedChart, shiftsChart, desktopTable, mobileTable
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
test('unconfirmed employees do not receive invented confirmed totals', () => {
  const c=confirmedChart(input);
  assert.equal(c.data.length,6);
  assert.deepEqual(c.data.map(v=>v.y),[584,299,542,479,554,582]);
  assert.ok(c.data.every(v=>!v.x.startsWith('01')&&!v.x.startsWith('07')));
});
test('shift chart includes all eight employees and retains separate afternoon sessions', () => {
  const c=shiftsChart(input);
  assert.equal(c.type,'Chart.VerticalBar.Grouped');
  assert.equal(c.stacked,true);
  assert.equal(new Set(c.data.flatMap(v=>v.values.map(p=>p.x))).size,8);
  assert.equal(c.data.length,3);
  assert.deepEqual(c.data[2].values,[{x:'06',y:27}]);
});
test('one real table determines all desktop column widths', () => {
  const a=desktopTable(input),b=mobileTable(input);
  assert.equal(a.rows.length,9);
  assert.equal(b.rows.length,9);
  assert.equal(a.columns.length,4);
  assert.equal(b.columns.length,2);
  assert.ok(a.columns.every(c=>Number.isInteger(c.width)));
  assert.ok(a.rows.every(r=>r.cells.length===4));
  assert.ok(b.rows.every(r=>r.cells.length===2));
  assert.equal(a.targetWidth,'atLeast:Standard');
  assert.equal(b.targetWidth,'atMost:Narrow');
});
test('native card preserves literal input and uses no image URL or formatter callback', () => {
  const before=JSON.stringify(input);
  const card=buildNativeCard(input);
  const qa=auditCard(card,input);
  assert.equal(JSON.stringify(input),before);
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.external_chart_requests,0);
  assert.equal(qa.render_qa,'pending_designer_and_real_teams_clients');
  const json=JSON.stringify(card);
  for(const forbidden of ['quickchart','livegap','data:image','"color":"Light"','"isVisible.dynamic"']) assert.ok(!json.includes(forbidden));
});
test('mismatched KPI and incomplete roster fail closed', () => {
  const changed=structuredClone(input);
  changed.kpis.closed=8;
  assert.throws(()=>buildNativeCard(changed),/KPI/);
  changed.employees.pop();
  assert.throws(()=>buildNativeCard(changed),/eight/);
});
