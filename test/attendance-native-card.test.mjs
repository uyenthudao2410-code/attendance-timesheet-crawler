import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT,ROW_VISUAL_REVISION,buildNativeCard,auditCard,validateSource,
  validateDirectory,sourceDigest,durationMinutes,recordedMinutes,
  sessionMinutes,shiftTotalMinutes,formatRecordedMinutes,formatWorkdays,
  workdaysFromMinutes,consolidatedShiftChart,consolidatedWorkdayChart,
  employeeSelectionTargets,attendanceChartLabel,microsoftNativeAccount,
  employeeDetailPanel,employeeAccountList
} from '../src/attendance-native-card.mjs';

const input=JSON.parse(fs.readFileSync(
  'test/fixtures/attendance-native-card-input.json','utf8'
));
const directory=JSON.parse(fs.readFileSync(
  'test/fixtures/attendance-user-directory.json','utf8'
));
const section=(card,id)=>card.body.find(x=>x.id===id);
const accounts=card=>section(card,'microsoft-account-list');
const rows=card=>accounts(card).items.filter(x=>/^account-row-[1-8]$/.test(x.id||''));
const panels=card=>accounts(card).items.filter(x=>/^p[1-8]$/.test(x.id||''));
const all=root=>{
  const values=[];
  const go=x=>{
    if(x&&typeof x==='object'){
      if(x.type)values.push(x);
      Object.values(x).forEach(go);
    }
  };
  go(root);
  return values;
};
const personaAt=(card,index)=>rows(card)[index].items[0].columns[0].items[0];

test('source and Microsoft account directory remain immutable and preserve eight identities',()=>{
  const original=JSON.stringify(input);
  assert.equal(validateSource(input),input);
  assert.equal(validateDirectory(input,directory),directory);
  assert.equal(sourceDigest(input),
    'cedcad7b9226d6009a0e516aa1fcb198cf8e715276a060831125fb9c30336f6e');
  buildNativeCard(input,directory);
  assert.equal(JSON.stringify(input),original);
  assert.equal(input.employees.length,8);
  assert.equal(input.employees[0].name,'Điêu Văn Mạnh');
});

test('recorded sessions, total minutes, and converted workdays come only from source',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(recordedMinutes(input.employees[0]),657);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(shiftTotalMinutes(input.employees[0],'morning'),290);
  assert.equal(sessionMinutes(input.employees[6].afternoon).length,0);
});

test('workday native Chart.HorizontalBar labels use full names, not index shortcuts',()=>{
  const ch=consolidatedWorkdayChart(input);
  assert.equal(ch.type,'Chart.HorizontalBar');
  assert.equal(ch.data.length,8);
  assert.equal(ch.showBarValues,true);
  ch.data.forEach((bar,i)=>{
    assert.equal(bar.x,input.employees[i].name);
    assert.equal(bar.y,workdaysFromMinutes(recordedMinutes(input.employees[i])));
    assert.equal(bar.color,'categoricalBlue');
  });
});

test('shift native Chart.HorizontalBar.Stacked preserves morning/afternoon original values',()=>{
  const ch=consolidatedShiftChart(input);
  assert.equal(ch.type,'Chart.HorizontalBar.Stacked');
  assert.equal(ch.data.length,8);
  assert.equal(ch.showLegend,true);
  ch.data.forEach((row,i)=>{
    const e=input.employees[i];
    assert.equal(row.title,e.name);
    assert.equal(row.data.find(x=>x.legend==='Ca sáng')?.value||0,
      Math.round(shiftTotalMinutes(e,'morning')/6)/10);
    assert.equal(row.data.find(x=>x.legend==='Ca chiều')?.value||0,
      Math.round(shiftTotalMinutes(e,'afternoon')/6)/10);
  });
});

test('zero-hour employee retains a zero source-bound chart category',()=>{
  const source=structuredClone(input);
  source.employees[2].morning='—';
  source.employees[2].afternoon='—';
  assert.deepEqual(consolidatedShiftChart(source).data[2].data,
    [{legend:'Ca sáng',value:0,color:'categoricalBlue'}]);
  assert.equal(consolidatedWorkdayChart(source).data[2].y,0);
});

test('four small colored KPI cards remain legible and source-bound',()=>{
  const overview=section(buildNativeCard(input,directory),'overview');
  assert.equal(overview.items.length,3);
  const tiles=[...overview.items[0].columns,...overview.items[1].columns]
    .map(x=>x.items[0]);
  assert.deepEqual(tiles.map(x=>x.style),['good','emphasis','warning','good']);
  assert.deepEqual(tiles.map(x=>x.items[1].text),[
    input.total_hours,
    formatWorkdays(durationMinutes(input.total_hours)),
    formatWorkdays(input.employees.reduce((n,e)=>n+shiftTotalMinutes(e,'morning'),0)),
    input.rate
  ]);
});

test('the two native charts switch tabs without modifying account visibility',()=>{
  const card=buildNativeCard(input,directory);
  assert.equal(section(card,'chart-workday').isVisible,undefined);
  assert.equal(section(card,'chart-shift').isVisible,false);
  assert.equal(section(card,'native-tab-shift').isVisible,false);
  assert.equal(section(card,'native-tab-workday').actions[1].style,'positive');
  assert.equal(section(card,'native-tab-workday').actions[0].targetElements.length,4);
  assert.equal(section(card,'native-tab-shift').actions[1].targetElements.length,4);
});

test('old numbered selector and manually assembled account avatars are completely absent',()=>{
  const card=buildNativeCard(input,directory);
  assert.equal(section(card,'sel'),undefined);
  assert.equal(section(card,'details'),undefined);
  assert.equal(section(card,'employee-directory'),undefined);
  assert.equal(all(card).filter(x=>x.type==='Image').length,0);
  assert.equal(all(card).filter(x=>x.type==='Component').length,8);
  assert.equal(all(card).filter(x=>x.type==='ProgressBar').length,0);
  assert.ok(!JSON.stringify(card.body).includes('Chọn số 01–08'));
  assert.equal(rows(card).length,8);
  assert.equal(panels(card).length,8);
});

test('each account is a genuine native Teams Graph user Persona bound to the Entra user',()=>{
  const card=buildNativeCard(input,directory);
  for(let i=0;i<8;i++){
    const e=input.employees[i];
    const graph=directory[e.name];
    const person=personaAt(card,i);
    assert.deepEqual(person,microsoftNativeAccount(e,directory));
    assert.deepEqual(person,{
      type:'Component',name:'graph.microsoft.com/user',view:'compact',
      properties:{
        id:graph.id,
        displayName:graph.displayName,
        userPrincipalName:graph.userPrincipalName
      }
    });
    assert.ok(/^[0-9a-f-]{36}$/.test(person.properties.id));
  }
});

test('clicking the native account row toggles only the selected attendance detail',()=>{
  const card=buildNativeCard(input,directory);
  rows(card).forEach((row,i)=>{
    assert.equal(row.type,'Container');
    assert.equal(row.id,'account-row-'+(i+1));
    assert.equal(row.selectAction.type,'Action.ToggleVisibility');
    assert.deepEqual(row.selectAction.targetElements,employeeSelectionTargets(input,i));
    const chevron=row.items[0].columns[1].items[0];
    assert.equal(chevron.type,'Icon');
    assert.equal(chevron.name,'ChevronDown');
    assert.deepEqual(chevron.selectAction,row.selectAction);
    assert.equal(row.items[0].columns[0].items[0].type,'Component');
  });
});

test('exclusive selection is deterministic and supports switching between people',()=>{
  const card=buildNativeCard(input,directory);
  const visibility=new Map(input.employees.map((e,i)=>['p'+(i+1),false]));
  for (const index of [0,5,2,7,1]){
    const targets=rows(card)[index].selectAction.targetElements;
    assert.equal(targets.length,8);
    for(const t of targets)visibility.set(t.elementId,t.isVisible);
    assert.equal([...visibility].filter(([k,v])=>v).length,1);
    assert.equal(visibility.get('p'+(index+1)),true);
  }
  assert.throws(()=>employeeSelectionTargets(input,8),/Invalid employee index/);
  assert.throws(()=>employeeSelectionTargets(input,-1),/Invalid employee index/);
});

test('profile detail appears immediately after its Microsoft account row and is hidden initially',()=>{
  const card=buildNativeCard(input,directory);
  const list=accounts(card).items;
  for(let i=0;i<8;i++){
    assert.equal(list[i*2+1].id,'account-row-'+(i+1));
    assert.equal(list[i*2+2].id,'p'+(i+1));
    assert.equal(list[i*2+2].isVisible,false);
    const close=list[i*2+2].items.at(-1).actions[0];
    assert.equal(close.type,'Action.ToggleVisibility');
    assert.equal(close.title,'Thu gọn');
    assert.deepEqual(close.targetElements,[{
      elementId:'p'+(i+1),isVisible:false
    }]);
  }
});

test('detail shows unmodified status, source time range, duration and converted work',()=>{
  const card=buildNativeCard(input,directory);
  const first=panels(card)[0];
  const text=JSON.stringify(first);
  for(const expected of [
    'Cần đối soát','08:37–13:27 · 4h50',
    '13:27–19:34 · 6h07','Chưa chốt','10h57','1,37 công'
  ])assert.ok(text.includes(expected),expected);
  assert.equal(all(first).filter(x=>x.type==='Image').length,0);
});

test('morning-only report hides afternoon source and shows morning-only workdays',()=>{
  const morning=structuredClone(input);
  morning.report_title='BÁO CÁO CHẤM CÔNG — CA SÁNG';
  morning.report_scope='morning';
  morning.employees.forEach(e=>{
    e.afternoon='—';
    if(e.status==='Đã ghi nhận')
      e.total=formatRecordedMinutes(shiftTotalMinutes(e,'morning'));
  });
  morning.kpis.with_record=morning.employees.filter(e=>e.morning!=='—').length;
  morning.rate=String(Math.round(morning.kpis.with_record/8*100))+'%';
  morning.total_hours=formatRecordedMinutes(
    morning.employees.filter(e=>e.status==='Đã ghi nhận')
      .reduce((n,e)=>n+durationMinutes(e.total),0)
  );
  const card=buildNativeCard(morning,directory);
  assert.equal(section(card,'chart-shift').items[1].showLegend,false);
  assert.ok(!JSON.stringify(section(card,'chart-shift')).includes('Ca chiều'));
  assert.equal(section(card,'microsoft-account-list'),undefined);
  assert.equal(all(card).filter(x=>x.type==='Component').length,0);
  assert.equal(section(card,'chart-workday').items[1].data[0].y,
    workdaysFromMinutes(shiftTotalMinutes(morning.employees[0],'morning')));
  const audit=auditCard(card,morning,directory);
  assert.equal(audit.graph_persona_count,0);
  assert.equal(audit.profile_panel_count,0);
  assert.equal(audit.native_account_row_count,0);
  assert.equal(audit.inline_chart_details,true);
  for(let i=0;i<8;i++){
    const e=morning.employees[i],expected=attendanceChartLabel(e,'morning');
    assert.equal(section(card,'chart-workday').items[1].data[i].x,expected);
    assert.equal(section(card,'chart-shift').items[1].data[i].title,expected);
    assert.ok(expected.includes(e.name)&&expected.includes(e.status));
    assert.ok(expected.includes(e.morning==='—'?'—':e.morning.slice(0,5)));
  }
});

test('QA enforces Microsoft-native persona identity, chart data and payload budget',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V24_BALANCED_INFO_BARS');
  assert.equal(ROW_VISUAL_REVISION,'V24_GRAPH_NATIVE_PERSONA_ACCOUNTS_2026_10_08');
  assert.equal(qa.chart_count,2);
  assert.equal(qa.graph_persona_count,8);
  assert.equal(qa.native_microsoft_personas,true);
  assert.equal(qa.image_avatar_count,0);
  assert.equal(qa.graph_avatar_count,0);
  assert.equal(qa.native_account_row_count,8);
  assert.equal(qa.selector_count,0);
  assert.equal(qa.detail_interaction,'native_account_row_tap_exclusive_attendance_panel');
  assert.deepEqual(all(card).filter(x=>x.type.startsWith('Chart.')).map(x=>x.type),
    ['Chart.HorizontalBar','Chart.HorizontalBar.Stacked']);
  assert.ok(qa.bytes<27000);
});

test('QA does not embed Graph profile photos even if legacy image parameters exist',()=>{
  const avatars=Object.fromEntries(input.employees.map(e=>[
    e.name,'data:image/jpeg;base64,'+'A'.repeat(1800)
  ]));
  const card=buildNativeCard(input,directory,avatars);
  assert.equal(all(card).filter(x=>x.type==='Image').length,0);
  assert.equal(auditCard(card,input,directory,avatars).graph_persona_count,8);
  assert.equal(JSON.stringify(card),JSON.stringify(buildNativeCard(input,directory)));
});

test('QA fails closed when account identity or chart data has been modified',()=>{
  const card=buildNativeCard(input,directory);
  personaAt(card,0).properties.id='00000000-0000-0000-0000-000000000000';
  assert.throws(()=>auditCard(card,input,directory),/Native Microsoft account mismatch/);
  const tampered=buildNativeCard(input,directory);
  section(tampered,'chart-workday').items[1].data[0].y=99;
  assert.throws(()=>auditCard(tampered,input,directory),/Layout\/data mismatch/);
  const altered=buildNativeCard(input,directory);
  panels(altered)[0].items[2].text='forged hours';
  assert.throws(()=>auditCard(altered,input,directory),/Layout\/data mismatch/);
});

test('invalid KPI, missing employees and wrong Entra identities cannot publish',()=>{
  const bad=structuredClone(input);
  bad.kpis.closed=8;
  assert.throws(()=>buildNativeCard(bad,directory),/KPI/);
  bad.employees.pop();
  assert.throws(()=>buildNativeCard(bad,directory),/eight/);
  const wrong=structuredClone(directory);
  wrong[input.employees[0].name].id='missing-guid';
  assert.throws(()=>buildNativeCard(input,wrong),/Invalid Entra id/);
});


test('morning chart renders every session and source status inline without extra account rows',()=>{
  const morning=structuredClone(input);
  morning.report_title='BÁO CÁO CHẤM CÔNG — CA SÁNG';
  morning.report_scope='morning';
  morning.employees.forEach(e=>{
    e.afternoon='—';
    if(e.status==='Đã ghi nhận')
      e.total=formatRecordedMinutes(shiftTotalMinutes(e,'morning'));
  });
  morning.kpis.with_record=morning.employees.filter(e=>e.morning!=='—').length;
  morning.rate=String(Math.round(morning.kpis.with_record/8*100))+'%';
  morning.total_hours=formatRecordedMinutes(
    morning.employees.filter(e=>e.status==='Đã ghi nhận')
      .reduce((sum,e)=>sum+durationMinutes(e.total),0)
  );
  const card=buildNativeCard(morning,directory);
  assert.equal(section(card,'microsoft-account-list'),undefined);
  const bars=section(card,'chart-workday').items[1].data;
  const shifts=section(card,'chart-shift').items[1].data;
  assert.equal(bars.length,8);
  bars.forEach((bar,i)=>{
    const e=morning.employees[i];
    assert.equal(bar.x,e.name+' · '+e.morning.replace(/ \((\d+h\d{2})\)/g,' · $1')+' · '+e.status);
    assert.equal(shifts[i].title,bar.x);
    assert.equal(bar.y,workdaysFromMinutes(shiftTotalMinutes(e,'morning')));
  });
  assert.equal(auditCard(card,morning,directory).chart_architecture,
    'native_chart_inline_full_morning_details');
});
