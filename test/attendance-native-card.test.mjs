import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT, buildNativeCard, auditCard, validateSource, validateDirectory, sourceDigest,
  durationMinutes, sessionMinutes, recordedMinutes, shiftTotalMinutes,
  workdaysFromMinutes, formatRecordedMinutes, formatWorkdays,
  quickSummary, overviewStatusChart, personaShiftRow, personaWorkdayRow,
  compactDetailsTable
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

test('overview merges representative chart and KPI information into one block',()=>{
  const card=buildNativeCard(input,directory);
  const overview=card.body.find(n=>n.id==='overview');
  assert.ok(overview);
  assert.equal(overview.style,'emphasis');
  assert.ok(all(overview).some(n=>n.id==='overview-status-chart'));
  assert.ok(all(overview).some(n=>n.id==='kpi-mobile'));
  assert.ok(all(overview).some(n=>n.id==='kpi-wide'));
  const chart=overviewStatusChart(input);
  assert.equal(chart.type,'Chart.HorizontalBar.Stacked');
  assert.deepEqual(chart.data[0].data.map(d=>[d.legend,d.value]),[
    ['Đã chốt',6],['Chưa chốt',2]
  ]);
  const json=JSON.stringify(overview);
  assert.ok(json.includes('50h40'));
  assert.ok(json.includes('6,33 công'));
  assert.ok(json.includes('3,34'));
  assert.ok(json.includes('4,88'));
});

test('KPI cards are icon-rich, 2x2 on mobile and four across on desktop',()=>{
  const card=buildNativeCard(input,directory);
  const overview=card.body.find(n=>n.id==='overview');
  const mobile=all(overview).find(n=>n.id==='kpi-mobile');
  const wide=all(overview).find(n=>n.id==='kpi-wide');
  assert.equal(mobile.targetWidth,'atMost:Narrow');
  assert.equal(wide.targetWidth,'atLeast:Standard');
  assert.equal(mobile.items.length,2);
  assert.ok(mobile.items.every(row=>row.columns.length===2));
  assert.equal(wide.items[0].columns.length,4);
  assert.ok(all(mobile).filter(n=>n.type==='Icon').length>=4);
});

test('shift rows place Persona left, stacked bar middle and total hours right',()=>{
  const row=personaShiftRow(input.employees[0],0,directory);
  assert.equal(row.id,'shift-row-1');
  const cols=row.items[0].columns;
  assert.equal(cols.length,3);
  assert.equal(cols[0].width,36);
  assert.equal(cols[1].width,50);
  assert.equal(cols[2].width,14);
  const persona=cols[0].items[0];
  assert.equal(persona.type,'Component');
  assert.equal(persona.name,'graph.microsoft.com/user');
  assert.equal(persona.properties.id,directory['Điêu Văn Mạnh'].id);
  const bar=cols[1].items[0];
  assert.equal(bar.type,'ColumnSet');
  assert.equal(bar.columns.length,3);
  assert.equal(bar.columns[0].width,290);
  assert.equal(bar.columns[1].width,367);
  assert.equal(cols[2].items[0].text,'10h57');
});

test('workday rows place Persona left, single bar middle and workday value right',()=>{
  const row=personaWorkdayRow(input.employees[0],0,directory);
  assert.equal(row.id,'workday-row-1');
  const cols=row.items[0].columns;
  assert.equal(cols.length,3);
  assert.equal(cols[0].items[0].name,'graph.microsoft.com/user');
  assert.equal(cols[2].items[0].text,'1,37 công');
  const bar=cols[1].items[0];
  assert.equal(bar.type,'ColumnSet');
  assert.equal(bar.columns.length,2);
  assert.equal(bar.columns[0].width,657);
});

test('all eight shift and workday rows are present with exact Entra personas',()=>{
  const card=buildNativeCard(input,directory);
  const shiftPanel=card.body.find(n=>n.id==='panel-shifts');
  const workdayPanel=card.body.find(n=>n.id==='panel-workdays');
  assert.equal(shiftPanel.items.filter(n=>/^shift-row-\d+$/.test(n.id||'')).length,8);
  assert.equal(workdayPanel.items.filter(n=>/^workday-row-\d+$/.test(n.id||'')).length,8);
  input.employees.forEach((e,i)=>{
    const shift=shiftPanel.items.find(n=>n.id==='shift-row-'+(i+1));
    const persona=shift.items[0].columns[0].items[0];
    assert.equal(persona.properties.id,directory[e.name].id);
  });
});

test('chart toggle switches the two persona-row views',()=>{
  const card=buildNativeCard(input,directory);
  const actionSet=card.body.find(n=>n.id==='chart-view-toggle');
  assert.equal(actionSet.actions.length,2);
  assert.equal(actionSet.actions[0].title,'Theo ca');
  assert.equal(actionSet.actions[1].title,'Công quy đổi');
  assert.deepEqual(actionSet.actions[0].targetElements,[
    {elementId:'panel-shifts',isVisible:true},
    {elementId:'panel-workdays',isVisible:false}
  ]);
  assert.equal(card.body.find(n=>n.id==='panel-shifts').isVisible,true);
  assert.equal(card.body.find(n=>n.id==='panel-workdays').isVisible,false);
});

test('there is no separate quick-summary or PersonaSet strip anymore',()=>{
  const card=buildNativeCard(input,directory);
  assert.equal(card.body.some(n=>n.id==='quick-summary'),false);
  assert.equal(card.body.some(n=>n.id==='chart-personas'),false);
  assert.equal(all(card).some(n=>n.name==='graph.microsoft.com/users'),false);
});

test('details stay collapsed and preserve exact time literals with Persona',()=>{
  const card=buildNativeCard(input,directory);
  const panel=card.body.find(n=>n.id==='attendance-details-panel');
  assert.equal(panel.isVisible,false);
  const table=panel.items.find(n=>n.id==='details-table-compact');
  assert.equal(table.rows.length,9);
  input.employees.forEach((e,i)=>{
    const json=JSON.stringify(table.rows[i+1]);
    assert.ok(json.includes(e.morning));
    assert.ok(json.includes(e.afternoon));
    assert.ok(json.includes(directory[e.name].id));
  });
});

test('V16 payload is row-based, persona-enabled and Microsoft native',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V16_PERSONA_BAR_ROWS');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.table_count,1);
  assert.equal(qa.chart_count,1);
  assert.equal(qa.donut_count,0);
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
