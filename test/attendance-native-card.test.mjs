import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
 LAYOUT,ROW_VISUAL_REVISION,buildNativeCard,auditCard,validateSource,
 validateDirectory,sourceDigest,durationMinutes,recordedMinutes,
 sessionMinutes,shiftTotalMinutes,formatRecordedMinutes,formatWorkdays,
 workdaysFromMinutes,workforceScales,overviewStatusChart,employeeNativeBar,
 employeeShiftBar
} from '../src/attendance-native-card.mjs';
const input=JSON.parse(fs.readFileSync('test/fixtures/attendance-native-card-input.json','utf8'));
const directory=JSON.parse(fs.readFileSync('test/fixtures/attendance-user-directory.json','utf8'));
const rows=c=>c.body.find(x=>x.id==='employee-chart-rows').items;
const walk=x=>{
 const result=[];
 const go=v=>{if(!v||typeof v!=='object')return;if(v.type)result.push(v);Object.values(v).forEach(go)};
 go(x);return result;
};
test('source, roster and Entra mapping preserve all eight employees',()=>{
 const before=JSON.stringify(input);
 assert.equal(validateSource(input),input);
 assert.equal(validateDirectory(input,directory),directory);
 assert.equal(sourceDigest(input),'cedcad7b9226d6009a0e516aa1fcb198cf8e715276a060831125fb9c30336f6e');
 buildNativeCard(input,directory);
 assert.equal(JSON.stringify(input),before);
});
test('workday values use only recorded minutes',()=>{
 assert.equal(durationMinutes('9h44'),584);
 assert.equal(recordedMinutes(input.employees[0]),657);
 assert.equal(formatRecordedMinutes(657),'10h57');
 assert.equal(formatWorkdays(657),'1,37 công');
 assert.equal(workdaysFromMinutes(480),1);
 assert.equal(shiftTotalMinutes(input.employees[0],'morning'),290);
 assert.equal(sessionMinutes(input.employees[6].afternoon).length,0);
});
test('native 12px bars represent exact source workday values on a shared scale',()=>{
 const scales=workforceScales(input);
 assert.deepEqual(scales,{shift:12,workday:1.5});
 input.employees.forEach((e,i)=>{
  const bar=employeeNativeBar(e,i,'workday',scales.workday);
  assert.equal(bar.type,'ColumnSet');
  assert.equal(bar.spacing,'None');
  assert.ok(bar.columns.every(c=>c.minHeight==='12px'));
  assert.ok(bar.columns.every(c=>c.roundedCorners===true));
  assert.ok(bar.columns.every(c=>['accent','emphasis'].includes(c.style)));
  const percent=Math.round(workdaysFromMinutes(recordedMinutes(e))/scales.workday*100);
  assert.equal(bar.columns.reduce((n,x)=>n+x.width,0),100);
  assert.equal(bar.columns.find(x=>x.style==='accent')?.width||0,percent);
 });
});

test('shift bar preserves session hours with compact contrasting tracks',()=>{
 const bar=employeeShiftBar(input.employees[0],0,12,'daily');
 assert.equal(bar.type,'RichTextBlock');
 assert.equal(bar.id,'shift-metric-1');
 assert.equal(bar.isVisible,false);
 assert.ok(bar.inlines[0].text.includes('Sáng 4h50'));
 assert.ok(bar.inlines[0].text.includes('Chiều 6h07'));
 assert.ok(bar.inlines.some(v=>v.color==='Accent'&&v.text.includes('▰')));
 assert.ok(bar.inlines.some(v=>v.color==='Good'&&v.text.includes('▰')));
});

test('avatar, charts and hidden details share the same employee ColumnSet',()=>{
 const card=buildNativeCard(input,directory);
 assert.equal(rows(card).length,8);
 rows(card).forEach((r,i)=>{
  const [avatarCol,metricCol]=r.items[0].columns;
  assert.equal(avatarCol.width,'44px');
  assert.equal(metricCol.width,'stretch');
  const avatar=avatarCol.items[0];
  assert.equal(avatar.type,'Image');
  assert.equal(avatar.style,'Person');
  assert.equal(avatar.height,'36px');
  assert.deepEqual(avatar.selectAction.targetElements,['employee-detail-'+(i+1)]);
  assert.equal(metricCol.items[0].id,'shift-metric-'+(i+1));
  assert.equal(metricCol.items[1].id,'workday-metric-'+(i+1));
  assert.equal(metricCol.items[1].items[1].type,'ColumnSet');
  assert.equal(metricCol.items[1].items[1].columns.reduce((n,c)=>n+c.width,0),100);
  assert.equal(r.items[1].id,'employee-detail-'+(i+1));
  assert.equal(r.items[1].isVisible,false);
 });
 assert.equal(walk(card).filter(x=>x.type==='Image').length,8);
});
test('Công quy đổi is shown by default, tabs toggle only metric content',()=>{
 const card=buildNativeCard(input,directory);
 const actions=card.body.find(x=>x.id==='chart-view-toggle').actions;
 assert.equal(actions.length,2);
 assert.equal(actions[1].style,'positive');
 assert.equal(actions[0].targetElements.length,16);
 assert.equal(actions[1].targetElements.length,16);
 assert.equal(actions[0].targetElements.find(x=>x.elementId==='shift-metric-3').isVisible,true);
 assert.equal(actions[1].targetElements.find(x=>x.elementId==='workday-metric-3').isVisible,true);
 const views=rows(card)[0].items[0].columns[1].items;
 assert.equal(views[0].isVisible,false);
 assert.equal(views[1].isVisible,undefined);
});

test('real Microsoft Graph photos are not duplicated in the card',()=>{
 const avatars=Object.fromEntries(input.employees.map(e=>[e.name,'data:image/jpeg;base64,/9j/2Q==']));
 const card=buildNativeCard(input,directory,avatars);
 rows(card).forEach((r,i)=>{
  const image=r.items[0].columns[0].items[0];
  assert.equal(image.url,'data:image/jpeg;base64,/9j/2Q==');
  assert.ok(!JSON.stringify(image).includes(input.employees[i].name));
 });
 const qa=auditCard(card,input,directory,avatars);
 assert.equal(qa.graph_avatar_count,8);
 assert.equal(qa.image_avatar_count,8);
});
test('hidden attendance panel contains every unmodified employee session',()=>{
 const p=rows(buildNativeCard(input,directory))[0].items[1];
 for(const value of [
  'Điêu Văn Mạnh','10h57','1,37 công','Chưa chốt',
  '08:37–13:27 · 4h50','13:27–19:34 · 6h07'
 ])assert.ok(JSON.stringify(p).includes(value));
});
test('V24 color KPI scorecards remain compact, source-bound and visually distinct',()=>{
 const card=buildNativeCard(input,directory);
 const overview=card.body.find(x=>x.id==='overview');
 assert.equal(overview.items.length,3);
 assert.equal(overview.items[0].columns.length,2);
 assert.equal(overview.items[1].columns.length,2);
 const tiles=[...overview.items[0].columns,...overview.items[1].columns]
   .map(col=>col.items[0]);
 assert.deepEqual(tiles.map(t=>t.style),['good','accent','warning','good']);
 assert.deepEqual(tiles.map(t=>t.items[1].text),[
  input.total_hours,
  formatWorkdays(durationMinutes(input.total_hours)),
  formatWorkdays(input.employees.reduce((n,e)=>n+shiftTotalMinutes(e,'morning'),0)),
  input.rate
 ]);
 assert.ok(!JSON.stringify(card.body).includes('TEST · NATIVE'));
 const qa=auditCard(card,input,directory);
 assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V24_BALANCED_INFO_BARS');
 assert.equal(ROW_VISUAL_REVISION,'V24_COLOR_KPI_THICK_WORKDAY_2026_10_08');
 assert.equal(qa.visual_revision,ROW_VISUAL_REVISION);
 assert.equal(qa.chart_architecture,'thick_native_columnset_shared_scale');
 assert.equal(qa.compact_kpi_tile_count,4);
 assert.equal(qa.bar_component,'ColumnSet:12px');
 assert.equal(qa.thick_bar_count,8);
 assert.equal(qa.progress_bar_count,0);
 assert.equal(qa.avatar_alignment,'same_columnset_per_employee_row');
 assert.equal(qa.native_microsoft_charts_only,true);
 assert.equal(walk(card).filter(x=>x.type==='Chart.HorizontalBar.Stacked').length,0);
 assert.equal(walk(card).filter(x=>x.type==='ProgressBar').length,0);
 assert.ok(qa.bytes<27000);
});

test('budget passes with eight realistic-sized simulated Graph avatars',()=>{
 const avatars=Object.fromEntries(input.employees.map(e=>[e.name,'data:image/jpeg;base64,'+'A'.repeat(900)]));
 const qa=auditCard(buildNativeCard(input,directory,avatars),input,directory,avatars);
 assert.equal(qa.graph_avatar_count,8);
 assert.ok(qa.bytes<27000);
});
test('tampered native chart values and invalid employee mapping fail closed',()=>{
 const card=buildNativeCard(input,directory);
 rows(card)[0].items[0].columns[1].items[1].items[1].columns[0].width=99;
 assert.throws(()=>auditCard(card,input,directory),/Layout\/data mismatch/);
 const invalid=structuredClone(directory);
 invalid[input.employees[0].name].id='wrong';
 assert.throws(()=>buildNativeCard(input,invalid),/Invalid Entra id/);
});
test('bad KPI or missing employee fails closed',()=>{
 const changed=structuredClone(input);
 changed.kpis.closed=8;
 assert.throws(()=>buildNativeCard(changed,directory),/KPI/);
 changed.employees.pop();
 assert.throws(()=>buildNativeCard(changed,directory),/eight/);
});
test('morning-only report never invents afternoon time or legend',()=>{
 const morning=structuredClone(input);
 morning.report_title='BÁO CÁO CHẤM CÔNG — CA SÁNG';
 morning.report_scope='morning';
 morning.employees.forEach(e=>{
  e.afternoon='—';
  if(e.status==='Đã ghi nhận')e.total=formatRecordedMinutes(shiftTotalMinutes(e,'morning'));
 });
 morning.kpis.with_record=morning.employees.filter(e=>e.morning!=='—').length;
 morning.rate=String(Math.round(morning.kpis.with_record/8*100))+'%';
 morning.total_hours=formatRecordedMinutes(morning.employees.filter(e=>e.status==='Đã ghi nhận')
  .reduce((n,e)=>n+durationMinutes(e.total),0));
 const card=buildNativeCard(morning,directory);
 assert.ok(!JSON.stringify(card.body.find(x=>x.id==='overview')).includes('Chiều '));
 assert.ok(!rows(card)[0].items[0].columns[1].items[0].inlines[0].text.includes('Chiều '));
});
