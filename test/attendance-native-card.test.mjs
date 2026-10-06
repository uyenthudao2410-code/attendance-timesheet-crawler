import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT, buildNativeCard, auditCard, validateSource, validateDirectory, sourceDigest,
  durationMinutes, sessionMinutes, shiftTotalMinutes,
  workdaysFromMinutes, formatRecordedMinutes, formatWorkdays,
  overviewStatusChart, personaShiftRow, vividShiftBar, compactDetailRows
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
});

test('workday conversion and source durations stay exact',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(workdaysFromMinutes(657),1.37);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
  assert.equal(shiftTotalMinutes(input.employees[0],'morning'),290);
  assert.equal(shiftTotalMinutes(input.employees[0],'afternoon'),367);
  assert.equal(sessionMinutes(input.employees[6].afternoon).length,0);
});

test('overview remains one compact block with representative native chart and KPI icons',()=>{
  const card=buildNativeCard(input,directory);
  const overview=card.body.find(n=>n.id==='overview');
  assert.ok(overview);
  assert.equal(overview.style,'emphasis');
  const status=all(overview).find(n=>n.id==='overview-status-chart');
  assert.equal(status.type,'Chart.HorizontalBar.Stacked');
  assert.deepEqual(status.data[0].data.map(d=>[d.legend,d.value]),[
    ['Đã chốt',6],['Chưa chốt',2]
  ]);
  assert.ok(all(overview).filter(n=>n.type==='Icon').length>=5);
  const json=JSON.stringify(overview);
  for(const value of ['50h40','6,33 công','Sáng 3,34 công','Chiều 4,88 công','100%']){
    assert.ok(json.includes(value),value);
  }
});

test('vivid bar uses strong colored glyph runs instead of pale container backgrounds',()=>{
  const bar=vividShiftBar(290,367);
  assert.equal(bar.type,'RichTextBlock');
  assert.equal(bar.inlines.length,3);
  assert.equal(bar.inlines[0].text,'██████');
  assert.equal(bar.inlines[0].color,'Accent');
  assert.equal(bar.inlines[0].size,'Large');
  assert.equal(bar.inlines[1].text,'████████');
  assert.equal(bar.inlines[1].color,'Good');
  assert.equal(bar.inlines[2].text,'░░');
  assert.equal(bar.inlines[2].isSubtle,true);
});

test('persona shift row is avatar left, vivid bar middle and total hours right',()=>{
  const row=personaShiftRow(input.employees[0],0,directory);
  assert.equal(row.type,'ColumnSet');
  assert.equal(row.id,'shift-row-1');
  assert.deepEqual(row.columns.map(c=>c.width),[36,50,14]);
  const persona=row.columns[0].items[0];
  assert.equal(persona.type,'Component');
  assert.equal(persona.name,'graph.microsoft.com/user');
  assert.equal(persona.properties.id,directory['Điêu Văn Mạnh'].id);
  const bar=row.columns[1].items[0];
  assert.equal(bar.type,'RichTextBlock');
  assert.equal(bar.inlines[0].color,'Accent');
  assert.equal(bar.inlines[1].color,'Good');
  assert.equal(row.columns[2].items[0].text,'10h57');
});

test('all eight main rows use exact Entra personas and vivid bars',()=>{
  const card=buildNativeCard(input,directory);
  const panel=card.body.find(n=>n.id==='panel-shifts');
  const rows=panel.items.filter(n=>/^shift-row-\d+$/.test(n.id||''));
  assert.equal(rows.length,8);
  rows.forEach((row,i)=>{
    const persona=row.columns[0].items[0];
    assert.equal(persona.properties.id,directory[input.employees[i].name].id);
    assert.equal(row.columns[1].items[0].type,'RichTextBlock');
  });
});

test('alternate workday view remains a compact native chart',()=>{
  const card=buildNativeCard(input,directory);
  const panel=card.body.find(n=>n.id==='panel-workdays');
  assert.equal(panel.isVisible,false);
  const chart=all(panel).find(n=>n.id==='workforce-workdays-chart');
  assert.equal(chart.type,'Chart.HorizontalBar');
  assert.equal(chart.showBarValues,true);
});

test('detail panel is hidden and each employee becomes a readable two-line micro-card',()=>{
  const card=buildNativeCard(input,directory);
  const panel=card.body.find(n=>n.id==='attendance-details-panel');
  assert.equal(panel.isVisible,false);
  assert.equal(panel.items.length,8);
  panel.items.forEach((row,i)=>{
    assert.equal(row.id,'detail-row-'+(i+1));
    assert.equal(row.type,'Container');
    assert.equal(row.items.length,2);
    assert.equal(row.items[0].type,'RichTextBlock');
    assert.equal(row.items[1].type,'RichTextBlock');
    const json=JSON.stringify(row);
    assert.ok(json.includes(input.employees[i].name));
    assert.ok(json.includes('công'));
    assert.ok(json.includes('S  '));
    assert.ok(json.includes('C  '));
  });
});

test('first detail micro-card separates name-summary from morning-afternoon data',()=>{
  const rows=compactDetailRows(input);
  assert.equal(rows.length,8);
  const first=rows[0];
  const top=first.items[0];
  const shifts=first.items[1];
  assert.equal(top.type,'RichTextBlock');
  assert.equal(shifts.type,'RichTextBlock');
  assert.ok(JSON.stringify(top).includes('01 · Điêu Văn Mạnh'));
  assert.ok(JSON.stringify(top).includes('10h57 · 1,37 công · Chưa chốt'));
  assert.ok(JSON.stringify(shifts).includes('08:37–13:27 · 4h50'));
  assert.ok(JSON.stringify(shifts).includes('13:27–19:34 · 6h07'));
});

test('there is no separate quick summary or bulk PersonaSet',()=>{
  const card=buildNativeCard(input,directory);
  assert.equal(card.body.some(n=>n.id==='quick-summary'),false);
  assert.equal(card.body.some(n=>n.id==='chart-personas'),false);
  assert.equal(all(card).some(n=>n.name==='graph.microsoft.com/users'),false);
});

test('V17 stays within Teams payload and remains Microsoft-native',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V17_VIVID_BARS_DETAILS');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.table_count,0);
  assert.equal(qa.chart_count,2);
  assert.equal(qa.donut_count,0);
  assert.equal(qa.persona_component_count,8);
  assert.equal(qa.persona_bar_row_count,8);
  assert.equal(qa.vivid_bar_mode,'richtext_glyphs');
  assert.equal(qa.detail_layout,'two_row_microcards');
  assert.equal(qa.external_chart_requests,0);
  assert.ok(qa.bytes<27000);
  assert.equal(all(card).filter(n=>n.type==='Image').length,0);
  assert.equal(JSON.stringify(card).includes('quickchart'),false);
});

test('mutating overview or directory binding fails audit',()=>{
  const card=buildNativeCard(input,directory);
  card.body.find(n=>n.id==='overview').items
    .find(n=>n.id==='overview-status-chart').data[0].data[0].value=99;
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
