import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT,ROW_VISUAL_REVISION,buildNativeCard,auditCard,validateSource,
  validateDirectory,sourceDigest,durationMinutes,recordedMinutes,
  sessionMinutes,shiftTotalMinutes,formatRecordedMinutes,formatWorkdays,
  workdaysFromMinutes,consolidatedShiftChart,consolidatedWorkdayChart,
  employeeSelectionTargets,employeeDetailPanel
} from '../src/attendance-native-card.mjs';

const input=JSON.parse(fs.readFileSync('test/fixtures/attendance-native-card-input.json','utf8'));
const directory=JSON.parse(fs.readFileSync('test/fixtures/attendance-user-directory.json','utf8'));
const section=(card,id)=>card.body.find(x=>x.id===id);
const all=card=>{
  const result=[];
  const go=x=>{if(x&&typeof x==='object'){if(x.type)result.push(x);Object.values(x).forEach(go)}};
  go(card);return result;
};
const detailPanels=card=>section(card,'details').items.filter(x=>/^p[1-8]$/.test(x.id||''));
const selectActions=card=>section(card,'sel').items.flatMap(x=>x.actions||[]);
const profileUrls=()=>Object.fromEntries(input.employees.map(e=>[e.name,'data:image/jpeg;base64,/9j/2Q==']));

test('source and Entra directory remain unchanged for all eight exact employees',()=>{
  const old=JSON.stringify(input);
  assert.equal(validateSource(input),input);
  assert.equal(validateDirectory(input,directory),directory);
  assert.equal(sourceDigest(input),'cedcad7b9226d6009a0e516aa1fcb198cf8e715276a060831125fb9c30336f6e');
  buildNativeCard(input,directory);
  assert.equal(JSON.stringify(input),old);
  assert.equal(input.employees[0].name,'Điêu Văn Mạnh');
});

test('full sessions and converted workdays are derived strictly from source',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(recordedMinutes(input.employees[0]),657);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(shiftTotalMinutes(input.employees[0],'morning'),290);
  assert.equal(sessionMinutes(input.employees[6].afternoon).length,0);
});

test('Công quy đổi chart keeps one native Chart.HorizontalBar and all names',()=>{
  const ch=consolidatedWorkdayChart(input);
  assert.equal(ch.type,'Chart.HorizontalBar');
  assert.equal(ch.data.length,8);
  assert.equal(ch.showBarValues,true);
  ch.data.forEach((r,i)=>{
    const e=input.employees[i];
    assert.equal(r.x,String(i+1).padStart(2,'0')+' · '+e.name);
    assert.equal(r.y,workdaysFromMinutes(recordedMinutes(e)));
  });
});

test('Theo ca chart keeps eight source-bound stacked rows and exact durations',()=>{
  const ch=consolidatedShiftChart(input);
  assert.equal(ch.type,'Chart.HorizontalBar.Stacked');
  assert.equal(ch.data.length,8);
  assert.equal(ch.showLegend,true);
  ch.data.forEach((r,i)=>{
    const e=input.employees[i];
    assert.equal(r.title,String(i+1).padStart(2,'0')+' · '+e.name);
    assert.equal(r.data.find(x=>x.legend==='Ca sáng')?.value||0,
      Math.round(shiftTotalMinutes(e,'morning')/6)/10);
    assert.equal(r.data.find(x=>x.legend==='Ca chiều')?.value||0,
      Math.round(shiftTotalMinutes(e,'afternoon')/6)/10);
  });
});

test('chart retains a zero bar category instead of inventing attendance data',()=>{
  const copy=structuredClone(input);
  copy.employees[2].morning='—';
  copy.employees[2].afternoon='—';
  assert.deepEqual(consolidatedShiftChart(copy).data[2].data,
    [{legend:'Ca sáng',value:0,color:'categoricalBlue'}]);
  assert.equal(consolidatedWorkdayChart(copy).data[2].y,0);
});

test('four compact KPI tiles preserve colors and totals',()=>{
  const card=buildNativeCard(input,directory);
  const overview=section(card,'overview');
  assert.equal(overview.items.length,3);
  const tiles=[...overview.items[0].columns,...overview.items[1].columns].map(x=>x.items[0]);
  assert.deepEqual(tiles.map(x=>x.style),['good','emphasis','warning','good']);
  assert.deepEqual(tiles.map(x=>x.items[1].text),[
    input.total_hours,
    formatWorkdays(durationMinutes(input.total_hours)),
    formatWorkdays(input.employees.reduce((n,e)=>n+shiftTotalMinutes(e,'morning'),0)),
    input.rate
  ]);
});

test('two native chart tabs toggle independently, only one shown',()=>{
  const card=buildNativeCard(input,directory);
  assert.equal(section(card,'chart-workday').isVisible,undefined);
  assert.equal(section(card,'chart-shift').isVisible,false);
  assert.equal(section(card,'native-tab-shift').isVisible,false);
  const work=section(card,'native-tab-workday');
  assert.equal(work.actions[1].style,'positive');
  assert.equal(work.actions[0].targetElements.length,4);
  assert.equal(section(card,'native-tab-shift').actions[1].targetElements.length,4);
});

test('bottom 2x4 account roster is removed; eight compact chart selectors remain',()=>{
  const card=buildNativeCard(input,directory);
  assert.equal(section(card,'employee-directory'),undefined);
  assert.ok(section(card,'sel'));
  assert.equal(section(card,'sel').items.length,3);
  assert.deepEqual(selectActions(card).map(x=>x.title),
    ['01','02','03','04','05','06','07','08']);
  assert.ok(selectActions(card).every(x=>x.type==='Action.ToggleVisibility'));
  assert.equal(section(card,'details').items[0].id,'h');
  assert.ok(detailPanels(card).every(x=>x.isVisible===false));
});

test('selecting any index shows exactly one detail panel and hides all others',()=>{
  const s=buildNativeCard(input,directory);
  const open=selectActions(s);
  for(let i=0;i<8;i++){
    const targets=open[i].targetElements;
    assert.equal(targets.length,10);
    assert.deepEqual(targets,employeeSelectionTargets(input,i));
    assert.equal(targets.filter(x=>x.elementId.startsWith('p')&&x.isVisible).length,1);
    assert.equal(targets.find(x=>x.elementId==='p'+(i+1)).isVisible,true);
    assert.equal(targets.find(x=>x.elementId==='h').isVisible,false);
    assert.equal(targets.find(x=>x.elementId==='z').isVisible,true);
  }
  const byId=new Map([['h',true],['z',false],...Array.from({length:8},(_,i)=>['p'+(i+1),false])]);
  for(const i of [1,5,2]){
    for(const v of open[i].targetElements)byId.set(v.elementId,v.isVisible);
    assert.equal([...byId].filter(([k,v])=>k.startsWith('p')&&v).length,1);
    assert.equal(byId.get('p'+(i+1)),true);
  }
});

test('close action resets all eight panels and the placeholder',()=>{
  const card=buildNativeCard(input,directory);
  const close=section(card,'details').items.find(x=>x.id==='z');
  assert.equal(close.isVisible,false);
  assert.equal(close.actions[0].title,'Thu gọn');
  assert.equal(close.actions[0].targetElements.length,10);
  assert.equal(close.actions[0].targetElements.find(x=>x.elementId==='h').isVisible,true);
  assert.ok(close.actions[0].targetElements.filter(x=>x.elementId.startsWith('p'))
    .every(x=>x.isVisible===false));
});

test('every hidden profile includes real Microsoft Graph avatar, account and attendance source',()=>{
  const avatars=profileUrls();
  const card=buildNativeCard(input,directory,avatars);
  assert.equal(detailPanels(card).length,8);
  detailPanels(card).forEach((panel,i)=>{
    const e=input.employees[i];
    const img=panel.items[0].columns[0].items[0];
    assert.equal(img.url,'data:image/jpeg;base64,/9j/2Q==');
    assert.equal(img.style,'Person');
    assert.equal(img.height,'54px');
    const serialized=JSON.stringify(panel);
    assert.ok(serialized.includes(e.name));
    assert.ok(serialized.includes(directory[e.name].userPrincipalName));
    assert.ok(serialized.includes(e.status));
    assert.ok(serialized.includes(e.total));
    assert.ok(serialized.includes('CA SÁNG'));
    assert.ok(serialized.includes('CA CHIỀU'));
    assert.equal(panel.isVisible,false);
  });
  const qa=auditCard(card,input,directory,avatars);
  assert.equal(qa.image_avatar_count,8);
  assert.equal(qa.graph_avatar_count,8);
});

test('the first detail preserves Điêu Văn Mạnh and both original punch ranges',()=>{
  const card=buildNativeCard(input,directory);
  const detail=detailPanels(card)[0];
  const content=JSON.stringify(detail);
  for(const value of ['Điêu Văn Mạnh','08:37–13:27 · 4h50',
    '13:27–19:34 · 6h07','Chưa chốt','1,37 công']){
    assert.ok(content.includes(value),value);
  }
});

test('morning-only hides every afternoon field in profile and chart',()=>{
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
  morning.total_hours=formatRecordedMinutes(morning.employees.filter(e=>e.status==='Đã ghi nhận')
    .reduce((n,e)=>n+durationMinutes(e.total),0));
  const card=buildNativeCard(morning,directory);
  assert.equal(section(card,'chart-shift').items[1].showLegend,false);
  assert.ok(!JSON.stringify(section(card,'chart-shift').items[1].data).includes('Ca chiều'));
  assert.ok(!JSON.stringify(detailPanels(card)).includes('CA CHIỀU'));
  assert.equal(section(card,'chart-workday').items[1].data[0].y,
    workdaysFromMinutes(shiftTotalMinutes(morning.employees[0],'morning')));
  assert.equal(auditCard(card,morning,directory).chart_count,2);
});

test('audit is fail closed and card retains two native charts with no fake bars',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V24_BALANCED_INFO_BARS');
  assert.equal(ROW_VISUAL_REVISION,'V24_INDEXED_HIDDEN_PROFILES_2026_10_08');
  assert.equal(qa.chart_count,2);
  assert.equal(qa.chart_architecture,'native_charts_with_exclusive_index_profile');
  assert.equal(qa.avatar_directory_count,0);
  assert.equal(qa.profile_panel_count,8);
  assert.equal(qa.selector_count,8);
  assert.equal(qa.exclusive_profile_selection,true);
  assert.equal(qa.detail_interaction,'number_selection_shows_exclusive_profile');
  assert.equal(qa.chart_point_select_action_supported,false);
  assert.deepEqual(all(card).filter(x=>x.type.startsWith('Chart.')).map(x=>x.type),
    ['Chart.HorizontalBar','Chart.HorizontalBar.Stacked']);
  assert.equal(all(card).some(x=>x.type==='ProgressBar'),false);
  assert.ok(qa.bytes<27000);
});

test('realistic embedded Graph photos stay under 27 KB',()=>{
  const avatars=Object.fromEntries(input.employees.map(e=>[
    e.name,'data:image/jpeg;base64,'+'A'.repeat(900)
  ]));
  assert.ok(auditCard(buildNativeCard(input,directory,avatars),
    input,directory,avatars).bytes<27000);
});

test('tampered profile and chart values are rejected rather than posted',()=>{
  const card=buildNativeCard(input,directory);
  section(card,'chart-workday').items[1].data[0].y=99;
  assert.throws(()=>auditCard(card,input,directory),/Layout\/data mismatch/);
  const card2=buildNativeCard(input,directory);
  detailPanels(card2)[0].items[1].text='changed';
  assert.throws(()=>auditCard(card2,input,directory),/Layout\/data mismatch/);
});

test('invalid KPI and Entra identity are rejected before publication',()=>{
  const bad=structuredClone(input);
  bad.kpis.closed=8;
  assert.throws(()=>buildNativeCard(bad,directory),/KPI/);
  bad.employees.pop();
  assert.throws(()=>buildNativeCard(bad,directory),/eight/);
  const broken=structuredClone(directory);
  broken[input.employees[0].name].id='broken';
  assert.throws(()=>buildNativeCard(input,broken),/Invalid Entra id/);
});
