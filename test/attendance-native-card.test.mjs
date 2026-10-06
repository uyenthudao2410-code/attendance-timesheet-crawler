import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT, buildNativeCard, auditCard, validateSource, validateDirectory, sourceDigest,
  durationMinutes, sessionMinutes, recordedMinutes, shiftTotalMinutes,
  workdaysFromMinutes, formatRecordedMinutes, formatWorkdays,
  quickSummary, overviewStatusChart, personaShiftRow, compactDetailLines
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

test('workday conversion and recorded durations stay exact',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(workdaysFromMinutes(657),1.37);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
  assert.equal(shiftTotalMinutes(input.employees[0],'morning'),290);
  assert.equal(shiftTotalMinutes(input.employees[0],'afternoon'),367);
  assert.equal(sessionMinutes(input.employees[6].afternoon).length,0);
});

test('overview is one compact block with representative chart, KPI icons and summary metrics',()=>{
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

test('persona shift row is avatar left, stacked bar middle, total hours right',()=>{
  const row=personaShiftRow(input.employees[0],0,directory);
  assert.equal(row.type,'ColumnSet');
  assert.equal(row.id,'shift-row-1');
  assert.equal(row.columns.length,3);
  assert.deepEqual(row.columns.map(c=>c.width),[36,50,14]);
  const persona=row.columns[0].items[0];
  assert.equal(persona.type,'Component');
  assert.equal(persona.name,'graph.microsoft.com/user');
  assert.equal(persona.properties.id,directory['Điêu Văn Mạnh'].id);
  const bar=row.columns[1].items[0];
  assert.equal(bar.type,'ColumnSet');
  assert.equal(bar.columns.length,3);
  assert.equal(bar.columns[0].width,290);
  assert.equal(bar.columns[0].style,'accent');
  assert.equal(bar.columns[1].width,367);
  assert.equal(bar.columns[1].style,'good');
  assert.equal(row.columns[2].items[0].text,'10h57');
});

test('all eight main rows use exact Entra personas',()=>{
  const card=buildNativeCard(input,directory);
  const panel=card.body.find(n=>n.id==='panel-shifts');
  const rows=panel.items.filter(n=>/^shift-row-\d+$/.test(n.id||''));
  assert.equal(rows.length,8);
  rows.forEach((row,i)=>{
    const persona=row.columns[0].items[0];
    assert.equal(persona.properties.id,directory[input.employees[i].name].id);
  });
});

test('alternate workday view is one compact native chart',()=>{
  const card=buildNativeCard(input,directory);
  const panel=card.body.find(n=>n.id==='panel-workdays');
  assert.equal(panel.isVisible,false);
  const chart=all(panel).find(n=>n.id==='workforce-workdays-chart');
  assert.equal(chart.type,'Chart.HorizontalBar');
  assert.equal(chart.showBarValues,true);
});

test('chart toggle switches shift persona rows and workday chart',()=>{
  const card=buildNativeCard(input,directory);
  const actionSet=card.body.find(n=>n.id==='chart-view-toggle');
  assert.equal(actionSet.actions.length,2);
  assert.equal(actionSet.actions[0].title,'Theo ca');
  assert.equal(actionSet.actions[1].title,'Công quy đổi');
  assert.deepEqual(actionSet.actions[0].targetElements,[
    {elementId:'panel-shifts',isVisible:true},
    {elementId:'panel-workdays',isVisible:false}
  ]);
});

test('detail panel is hidden and each employee is one compact logical line',()=>{
  const card=buildNativeCard(input,directory);
  const panel=card.body.find(n=>n.id==='attendance-details-panel');
  assert.equal(panel.isVisible,false);
  assert.equal(panel.items.length,8);
  panel.items.forEach((line,i)=>{
    assert.equal(line.id,'detail-line-'+(i+1));
    assert.equal(line.type,'TextBlock');
    assert.ok(line.text.includes(input.employees[i].name));
    assert.ok(line.text.includes(input.employees[i].morning));
    assert.ok(line.text.includes(input.employees[i].afternoon));
    assert.ok(line.text.includes('công'));
  });
  assert.equal(all(panel).filter(n=>n.type==='Component').length,0);
});

test('compact detail line helper preserves source literals',()=>{
  const lines=compactDetailLines(input);
  assert.equal(lines.length,8);
  assert.ok(lines[0].text.includes('Điêu Văn Mạnh'));
  assert.ok(lines[0].text.includes('08:37–13:27 (4h50)'));
  assert.ok(lines[0].text.includes('13:27–19:34 (6h07)'));
  assert.ok(lines[0].text.includes('10h57'));
  assert.ok(lines[0].text.includes('1,37 công'));
});

test('there is no separate quick summary or bulk PersonaSet',()=>{
  const card=buildNativeCard(input,directory);
  assert.equal(card.body.some(n=>n.id==='quick-summary'),false);
  assert.equal(card.body.some(n=>n.id==='chart-personas'),false);
  assert.equal(all(card).some(n=>n.name==='graph.microsoft.com/users'),false);
});

test('V16 stays within Teams payload and is Microsoft-native',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V16_PERSONA_BAR_ROWS');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.table_count,0);
  assert.equal(qa.chart_count,2);
  assert.equal(qa.donut_count,0);
  assert.equal(qa.persona_component_count,8);
  assert.equal(qa.persona_bar_row_count,8);
  assert.equal(qa.native_microsoft_charts_only,true);
  assert.equal(qa.native_microsoft_personas,true);
  assert.equal(qa.quick_summary_mode,'merged_overview');
  assert.equal(qa.personas_in_chart_section,true);
  assert.equal(qa.row_based_persona_bars,true);
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
