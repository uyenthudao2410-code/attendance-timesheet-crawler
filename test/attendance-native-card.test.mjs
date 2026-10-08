import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT,ROW_VISUAL_REVISION,buildNativeCard,auditCard,validateSource,
  validateDirectory,sourceDigest,durationMinutes,recordedMinutes,
  sessionMinutes,shiftTotalMinutes,formatRecordedMinutes,formatWorkdays,
  workdaysFromMinutes,consolidatedShiftChart,consolidatedWorkdayChart,
  employeeDirectoryCell,employeeDirectoryGrid,overviewStatusChart
} from '../src/attendance-native-card.mjs';

const input=JSON.parse(fs.readFileSync('test/fixtures/attendance-native-card-input.json','utf8'));
const directory=JSON.parse(fs.readFileSync('test/fixtures/attendance-user-directory.json','utf8'));
const find=(c,id)=>c.body.find(x=>x.id===id);
const roster=c=>find(c,'employee-directory').items.flatMap(r=>r.columns);
const walk=root=>{
  const result=[];
  const rec=x=>{if(x&&typeof x==='object'){if(x.type)result.push(x);Object.values(x).forEach(rec)}};
  rec(root);return result;
};
const photo=(s)=>Object.fromEntries(s.employees.map(e=>[e.name,'data:image/jpeg;base64,/9j/2Q==']));

test('valid source remains unchanged and the exact eight employee names are preserved',()=>{
  const before=JSON.stringify(input);
  assert.equal(validateSource(input),input);
  assert.equal(validateDirectory(input,directory),directory);
  assert.equal(sourceDigest(input),'cedcad7b9226d6009a0e516aa1fcb198cf8e715276a060831125fb9c30336f6e');
  buildNativeCard(input,directory);
  assert.equal(JSON.stringify(input),before);
  assert.equal(input.employees.length,8);
  assert.equal(input.employees[0].name,'Điêu Văn Mạnh');
});

test('hour and workday metrics are strictly calculated from source sessions',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(recordedMinutes(input.employees[0]),657);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(shiftTotalMinutes(input.employees[0],'morning'),290);
  assert.equal(sessionMinutes(input.employees[6].afternoon).length,0);
});

test('Công quy đổi is one true native Chart.HorizontalBar with eight complete names',()=>{
  const chart=consolidatedWorkdayChart(input);
  assert.equal(chart.type,'Chart.HorizontalBar');
  assert.equal(chart.data.length,8);
  assert.equal(chart.showBarValues,true);
  assert.equal(chart.showLegend,false);
  assert.equal(chart.displayMode,'AbsoluteNoAxis');
  chart.data.forEach((bar,i)=>{
    const e=input.employees[i];
    assert.equal(bar.x,String(i+1).padStart(2,'0')+' · '+e.name);
    assert.equal(bar.y,workdaysFromMinutes(recordedMinutes(e)));
    assert.equal(bar.color,'categoricalBlue');
  });
});

test('Theo ca is one true native stacked chart with exact morning and afternoon hours',()=>{
  const chart=consolidatedShiftChart(input);
  assert.equal(chart.type,'Chart.HorizontalBar.Stacked');
  assert.equal(chart.data.length,8);
  assert.equal(chart.showLegend,true);
  assert.equal(chart.showBarValues,true);
  chart.data.forEach((row,i)=>{
    const e=input.employees[i];
    assert.equal(row.title,String(i+1).padStart(2,'0')+' · '+e.name);
    const morning=row.data.find(p=>p.legend==='Ca sáng');
    const afternoon=row.data.find(p=>p.legend==='Ca chiều');
    const m=shiftTotalMinutes(e,'morning'),a=shiftTotalMinutes(e,'afternoon');
    assert.equal(morning?.value??0,Math.round(m/6)/10);
    assert.equal(afternoon?.value??0,Math.round(a/6)/10);
    assert.ok(row.data.every(p=>['categoricalBlue','categoricalGreen'].includes(p.color)));
  });
});

test('zero-hour employees retain a zero-value chart category without invented work',()=>{
  const zero=structuredClone(input);
  zero.employees[2].morning='—';
  zero.employees[2].afternoon='—';
  const row=consolidatedShiftChart(zero).data[2];
  assert.equal(row.title,'03 · '+zero.employees[2].name);
  assert.deepEqual(row.data,[{legend:'Ca sáng',value:0,color:'categoricalBlue'}]);
  assert.equal(consolidatedWorkdayChart(zero).data[2].y,0);
});

test('four compact colored KPI tiles show source-bound values with readable accent text',()=>{
  const card=buildNativeCard(input,directory);
  const overview=find(card,'overview');
  assert.equal(overview.items.length,3);
  const tiles=[...overview.items[0].columns,...overview.items[1].columns]
    .map(column=>column.items[0]);
  assert.deepEqual(tiles.map(t=>t.style),['good','emphasis','warning','good']);
  assert.deepEqual(tiles.map(t=>t.items[1].text),[
    input.total_hours,
    formatWorkdays(durationMinutes(input.total_hours)),
    formatWorkdays(input.employees.reduce((n,e)=>n+shiftTotalMinutes(e,'morning'),0)),
    input.rate
  ]);
  assert.equal(tiles[1].items[1].color,'Accent');
  assert.ok(!JSON.stringify(card.body).includes('TEST · NATIVE'));
  assert.equal(overview.items[2].text.includes('Đã chốt'),false);
  assert.ok(overview.items[2].text.includes('đã chốt'));
});

test('only one chart is visible per tab and selected styling follows the tab',()=>{
  const card=buildNativeCard(input,directory);
  const w=find(card,'chart-workday');
  const s=find(card,'chart-shift');
  assert.equal(w.isVisible,undefined);
  assert.equal(s.isVisible,false);
  assert.equal(w.items[1].type,'Chart.HorizontalBar');
  assert.equal(s.items[1].type,'Chart.HorizontalBar.Stacked');
  const wtab=find(card,'native-tab-workday'),stab=find(card,'native-tab-shift');
  assert.equal(wtab.isVisible,undefined);
  assert.equal(stab.isVisible,false);
  assert.equal(wtab.actions[1].style,'positive');
  assert.equal(stab.actions[0].style,'positive');
  assert.equal(wtab.actions[0].targetElements.length,4);
  assert.equal(stab.actions[1].targetElements.length,4);
  assert.equal(wtab.actions[0].targetElements.find(x=>x.elementId==='chart-shift').isVisible,true);
  assert.equal(stab.actions[1].targetElements.find(x=>x.elementId==='chart-shift').isVisible,false);
});

test('indexed directory has exactly 8 Graph avatars and 8 unique full names',()=>{
  const avatars=photo(input);
  const card=buildNativeCard(input,directory,avatars);
  const rows=find(card,'employee-directory').items;
  assert.equal(rows.length,4);
  assert.ok(rows.every(r=>r.type==='ColumnSet'&&r.columns.length===2));
  const chips=roster(card);
  assert.equal(chips.length,8);
  chips.forEach((chip,i)=>{
    assert.equal(chip.id,'employee-chip-'+(i+1));
    const columns=chip.items[0].items[0].columns;
    const image=columns[0].items[0];
    assert.equal(image.type,'Image');
    assert.equal(image.style,'Person');
    assert.equal(image.height,'32px');
    assert.equal(image.url,'data:image/jpeg;base64,/9j/2Q==');
    assert.deepEqual(image.selectAction.targetElements,['employee-detail-'+(i+1)]);
    assert.equal(columns[1].items[0].text,
      String(i+1).padStart(2,'0')+' · '+input.employees[i].name);
    assert.equal(chip.items[1].id,'employee-detail-'+(i+1));
    assert.equal(chip.items[1].isVisible,false);
  });
  assert.equal(walk(card).filter(x=>x.type==='Image').length,8);
  const qa=auditCard(card,input,directory,avatars);
  assert.equal(qa.graph_avatar_count,8);
  assert.equal(qa.avatar_render,'graph_profile_photo');
});

test('employee detail opens from its own avatar and preserves all complete sessions',()=>{
  const p=roster(buildNativeCard(input,directory))[0].items[1];
  assert.equal(p.id,'employee-detail-1');
  assert.equal(p.isVisible,false);
  for(const v of [
    'Điêu Văn Mạnh','10h57','1,37 công','Chưa chốt',
    '08:37–13:27 · 4h50','13:27–19:34 · 6h07'
  ]) assert.ok(JSON.stringify(p).includes(v),v);
});

test('dashboard QA recognizes exactly two consolidated Microsoft charts',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V24_BALANCED_INFO_BARS');
  assert.equal(ROW_VISUAL_REVISION,'V24_CONSOLIDATED_NATIVE_CHART_2026_10_08');
  assert.equal(qa.visual_revision,ROW_VISUAL_REVISION);
  assert.equal(qa.chart_count,2);
  assert.equal(qa.chart_architecture,'two_consolidated_native_charts');
  assert.equal(qa.shift_chart_count,1);
  assert.equal(qa.workday_chart_count,1);
  assert.equal(qa.avatar_directory_count,8);
  assert.equal(qa.avatar_alignment,'indexed_directory_01_to_08_below_chart');
  assert.equal(qa.workday_chart_layout,'single_chart_with_full_name_categories');
  assert.equal(qa.legend_scope,'once_per_chart');
  assert.equal(qa.chart_mode_toggle_targets,4);
  assert.equal(qa.native_microsoft_charts_only,true);
  assert.equal(qa.chart_full_names,true);
  assert.deepEqual(walk(card).filter(x=>x.type.startsWith('Chart.')).map(x=>x.type),
    ['Chart.HorizontalBar','Chart.HorizontalBar.Stacked']);
  assert.equal(walk(card).some(x=>x.type==='ProgressBar'),false);
  assert.ok(qa.bytes<27000);
});

test('realistic eight-avatar payload stays below Teams 27KB gate',()=>{
  const avatars=Object.fromEntries(input.employees.map(e=>[
    e.name,'data:image/jpeg;base64,'+'A'.repeat(1100)
  ]));
  const qa=auditCard(buildNativeCard(input,directory,avatars),input,directory,avatars);
  assert.equal(qa.graph_avatar_count,8);
  assert.ok(qa.bytes<27000);
});

test('QA fails closed for chart tampering and incorrect directory identity',()=>{
  const card=buildNativeCard(input,directory);
  find(card,'chart-workday').items[1].data[0].y=99;
  assert.throws(()=>auditCard(card,input,directory),/Layout\/data mismatch/);
  const bad=structuredClone(directory);
  bad[input.employees[0].name].id='bad';
  assert.throws(()=>buildNativeCard(input,bad),/Invalid Entra id/);
});

test('QA fails closed for missing people and invalid KPI',()=>{
  const bad=structuredClone(input);
  bad.kpis.closed=8;
  assert.throws(()=>buildNativeCard(bad,directory),/KPI/);
  bad.employees.pop();
  assert.throws(()=>buildNativeCard(bad,directory),/eight/);
});

test('morning-only report has no afternoon data in charts or expanded details',()=>{
  const morning=structuredClone(input);
  morning.report_title='BÁO CÁO CHẤM CÔNG — CA SÁNG';
  morning.report_scope='morning';
  morning.employees.forEach(e=>{
    e.afternoon='—';
    if(e.status==='Đã ghi nhận')e.total=formatRecordedMinutes(shiftTotalMinutes(e,'morning'));
  });
  morning.kpis.with_record=morning.employees.filter(e=>e.morning!=='—').length;
  morning.rate=String(Math.round(morning.kpis.with_record/8*100))+'%';
  morning.total_hours=formatRecordedMinutes(
    morning.employees.filter(e=>e.status==='Đã ghi nhận').reduce(
      (n,e)=>n+durationMinutes(e.total),0
    )
  );
  const card=buildNativeCard(morning,directory);
  const workday=find(card,'chart-workday').items[1];
  const shift=find(card,'chart-shift').items[1];
  assert.equal(shift.showLegend,false);
  assert.equal(JSON.stringify(shift.data).includes('Ca chiều'),false);
  assert.equal(JSON.stringify(roster(card)[0].items[1]).includes('Ca chiều'),false);
  assert.equal(workday.data[0].y,
    workdaysFromMinutes(shiftTotalMinutes(morning.employees[0],'morning')));
  assert.equal(auditCard(card,morning,directory).chart_count,2);
});
