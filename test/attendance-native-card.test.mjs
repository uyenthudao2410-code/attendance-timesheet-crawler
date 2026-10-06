import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT, buildNativeCard, auditCard, validateSource, validateDirectory, sourceDigest,
  durationMinutes, sessionMinutes, shiftTotalMinutes,
  workdaysFromMinutes, formatRecordedMinutes, formatWorkdays,
  overviewStatusChart, consolidatedShiftChart, consolidatedWorkdayChart,
  avatarRail, employeeDetailPanel
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

test('source and directory bindings remain exact',()=>{
  const before=JSON.stringify(input);
  assert.equal(validateSource(input),input);
  assert.equal(validateDirectory(input,directory),directory);
  assert.equal(sourceDigest(input),'cedcad7b9226d6009a0e516aa1fcb198cf8e715276a060831125fb9c30336f6e');
  buildNativeCard(input,directory);
  assert.equal(JSON.stringify(input),before);
});

test('workday conversion and source durations remain exact',()=>{
  assert.equal(durationMinutes('9h44'),584);
  assert.equal(workdaysFromMinutes(480),1);
  assert.equal(workdaysFromMinutes(657),1.37);
  assert.equal(formatRecordedMinutes(657),'10h57');
  assert.equal(formatWorkdays(657),'1,37 công');
  assert.equal(shiftTotalMinutes(input.employees[0],'morning'),290);
  assert.equal(shiftTotalMinutes(input.employees[0],'afternoon'),367);
  assert.equal(sessionMinutes(input.employees[6].afternoon).length,0);
});

test('overview is compact and uses bright blue-green status colors',()=>{
  const c=overviewStatusChart(input);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.deepEqual(c.data[0].data,[
    {legend:'Đã chốt',value:6,color:'categoricalBlue'},
    {legend:'Chưa chốt',value:2,color:'categoricalGreen'}
  ]);
});

test('one consolidated shift chart carries all eight employees',()=>{
  const c=consolidatedShiftChart(input);
  assert.equal(c.type,'Chart.HorizontalBar.Stacked');
  assert.equal(c.id,'workforce-shift-chart');
  assert.equal(c.showLegend,false);
  assert.equal(c.showBarValues,true);
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.data.length,8);
  assert.deepEqual(c.data[0].data,[
    {legend:'\u200B',value:4.8,color:'categoricalBlue'},
    {legend:'\u200C',value:6.1,color:'categoricalGreen'}
  ]);
  assert.deepEqual(c.data[2].data,[
    {legend:'\u200C',value:5,color:'categoricalGreen'}
  ]);
});

test('one consolidated workday chart carries all eight employees',()=>{
  const c=consolidatedWorkdayChart(input);
  assert.equal(c.type,'Chart.HorizontalBar');
  assert.equal(c.id,'workforce-workdays-chart');
  assert.equal(c.showLegend,false);
  assert.equal(c.showBarValues,true);
  assert.equal(c.displayMode,'AbsoluteNoAxis');
  assert.equal(c.data.length,8);
  assert.deepEqual(c.data.map(d=>d.y),[1.37,1.22,0.62,1.13,1,1.15,0.52,1.21]);
});

test('avatar rail contains exactly eight image-only avatar slots and no names',()=>{
  const rail=avatarRail(input,directory);
  assert.equal(rail.id,'avatar-rail');
  assert.equal(rail.items.length,8);
  rail.items.forEach((slot,i)=>{
    assert.equal(slot.id,'avatar-slot-'+(i+1));
    assert.equal(slot.minHeight,'46px');
    assert.equal(slot.items.length,1);
    const avatar=slot.items[0];
    assert.equal(avatar.type,'Image');
    assert.equal(avatar.style,'Person');
    assert.equal(avatar.height,'32px');
    assert.equal(avatar.altText,'');
    assert.match(avatar.url,/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    assert.equal(JSON.stringify(slot).includes(input.employees[i].name),false);
    assert.equal(slot.selectAction.type,'Action.ToggleVisibility');
  });
  assert.equal(all(rail).filter(n=>n.type==='ActionSet').length,0);
});

test('avatar tap opens its own detail and closes all other details',()=>{
  const rail=avatarRail(input,directory);
  const targets=rail.items[2].selectAction.targetElements;
  assert.equal(targets.length,8);
  assert.equal(targets[2],'employee-detail-3');
  targets.forEach((t,i)=>{
    if(i===2) return;
    assert.deepEqual(t,{elementId:'employee-detail-'+(i+1),isVisible:false});
  });
});

test('detail panels are hidden and preserve complete attendance data',()=>{
  const d=employeeDetailPanel(input.employees[0],0);
  assert.equal(d.id,'employee-detail-1');
  assert.equal(d.isVisible,false);
  const json=JSON.stringify(d);
  for(const value of [
    'Điêu Văn Mạnh','10h57','1,37 công','Chưa chốt',
    '08:37–13:27 · 4h50','13:27–19:34 · 6h07'
  ]) assert.ok(json.includes(value),value);
});

test('card chart grid has only avatar rail plus one active chart column',()=>{
  const card=buildNativeCard(input,directory);
  const grid=card.body.find(n=>n.id==='compact-chart-grid');
  assert.ok(grid);
  assert.equal(grid.columns.length,2);
  assert.deepEqual(grid.columns.map(c=>c.width),['38px','stretch']);
  assert.equal(grid.columns[0].items.length,1);
  assert.equal(grid.columns[0].items[0].id,'avatar-rail');
  const chartColumn=grid.columns[1];
  assert.equal(chartColumn.items.length,2);
  assert.equal(chartColumn.items[0].id,'shift-chart-container');
  assert.equal(chartColumn.items[0].isVisible,true);
  assert.equal(chartColumn.items[1].id,'workday-chart-container');
  assert.equal(chartColumn.items[1].isVisible,false);
});

test('no per-person mini charts, no per-person detail buttons, no footer notes',()=>{
  const card=buildNativeCard(input,directory);
  const json=JSON.stringify(card);
  assert.equal(/shift-chart-\d+/.test(json),false);
  assert.equal(json.includes('detail-action-'),false);
  assert.equal(json.includes('Chi tiết'),false);
  assert.equal(card.body.some(n=>n.id==='report-legend'),false);
});

test('single shared shift legend identifies morning and afternoon colors',()=>{
  const card=buildNativeCard(input,directory);
  const legend=card.body.find(n=>n.id==='shift-legend');
  assert.ok(legend);
  const json=JSON.stringify(legend);
  assert.ok(json.includes('Ca sáng'));
  assert.ok(json.includes('Ca chiều'));
});

test('Graph profile photo map overrides initials without exposing names beside avatars',()=>{
  const graphAvatars=Object.fromEntries(
    input.employees.map(e=>[e.name,'data:image/jpeg;base64,/9j/2Q=='])
  );
  const card=buildNativeCard(input,directory,graphAvatars);
  const qa=auditCard(card,input,directory,graphAvatars);
  assert.equal(qa.avatar_render,'graph_profile_photo');
  assert.equal(qa.graph_avatar_count,8);
  assert.equal(qa.image_avatar_count,8);
  const rail=card.body.find(n=>n.id==='compact-chart-grid').columns[0].items[0];
  rail.items.forEach((slot,i)=>{
    assert.equal(slot.items[0].url,'data:image/jpeg;base64,/9j/2Q==');
    assert.equal(JSON.stringify(slot).includes(input.employees[i].name),false);
  });
});

test('details area contains only eight hidden detail panels and consumes no space until opened',()=>{
  const card=buildNativeCard(input,directory);
  const details=card.body.find(n=>n.id==='details-area');
  assert.ok(details);
  assert.equal(details.items.length,8);
  assert.ok(details.items.every((d,i)=>d.id==='employee-detail-'+(i+1) && d.isVisible===false));
});

test('V23 contract supports real Graph photos with image-only avatars',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);

  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V23_GRAPH_PROFILE_PHOTO');
  assert.equal(qa.data_gate,'passed');
  assert.equal(qa.chart_architecture,'single_consolidated_chart');
  assert.equal(qa.shift_chart_count,1);
  assert.equal(qa.workday_chart_count,1);
  assert.equal(qa.avatar_rail_count,8);
  assert.equal(qa.detail_interaction,'avatar_tap_toggle');
  assert.equal(qa.detail_buttons,0);
  assert.equal(qa.details_hidden_by_default,true);
  assert.equal(qa.footer_notes,false);
  assert.equal(qa.repeated_legends,false);
  assert.equal(qa.palette,'categoricalBlue_categoricalGreen');
  assert.equal(qa.shift_legend,'Ca sáng | Ca chiều');
  assert.equal(qa.native_microsoft_charts_only,true);
  assert.equal(qa.native_microsoft_personas,false);
  assert.equal(qa.avatar_render,'embedded_png_fallback');
  assert.equal(qa.graph_avatar_count,0);
  assert.equal(qa.image_avatar_count,8);
  assert.equal(qa.persona_component_count,0);
  assert.equal(qa.external_chart_requests,0);
  assert.equal(all(card).filter(n=>n.type==='Image').length,8);
  assert.equal(JSON.stringify(card).includes('quickchart'),false);
  assert.ok(qa.bytes<27000);
});

test('mutating chart data or Entra binding fails closed',()=>{
  const card=buildNativeCard(input,directory);
  const grid=card.body.find(n=>n.id==='compact-chart-grid');
  grid.columns[1].items[0].items[0].data[0].data[0].value=99;
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
