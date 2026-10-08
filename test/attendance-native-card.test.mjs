import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT,ROW_VISUAL_REVISION,buildNativeCard,auditCard,validateSource,
  validateDirectory,sourceDigest,durationMinutes,recordedMinutes,
  sessionMinutes,shiftTotalMinutes,formatRecordedMinutes,formatWorkdays,
  workdaysFromMinutes,consolidatedShiftChart,consolidatedAfternoonChart,shiftDaypartTabs,consolidatedWorkdayChart,
  employeeSelectionTargets,attendanceChartLabel,verticalEmployeeNames,microsoftNativeAccount,
  employeeDetailPanel,dailyCompactDetails
} from '../src/attendance-native-card.mjs';

const input=JSON.parse(fs.readFileSync(
  'test/fixtures/attendance-native-card-input.json','utf8'
));
const directory=JSON.parse(fs.readFileSync(
  'test/fixtures/attendance-user-directory.json','utf8'
));
const section=(card,id)=>card.body.find(x=>x.id===id);
const details=card=>section(card,'daily-compact-details')?.items.find(x=>x.id==='daily-details-content');
const rows=card=>details(card)?.items.filter(x=>/^day-person-[1-8]$/.test(x.id||''))||[];
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

test('full-day report uses two compact horizontal native shift charts',()=>{
  const morning=consolidatedShiftChart(input),afternoon=consolidatedAfternoonChart(input);
  assert.equal(morning.type,'Chart.HorizontalBar');
  assert.equal(afternoon.type,'Chart.HorizontalBar');
  assert.equal(morning.color,'categoricalTeal');
  assert.equal(afternoon.color,'categoricalGreen');
  assert.equal(afternoon.isVisible,false);
  const names=verticalEmployeeNames(input);
  for(let i=0;i<8;i++){
    assert.equal(morning.data[i].x,String(i+1).padStart(2,'0')+' · '+names[i]);
    assert.equal(afternoon.data[i].x,String(i+1).padStart(2,'0')+' · '+names[i]);
    assert.equal(morning.data[i].y,Math.round(shiftTotalMinutes(input.employees[i],'morning')/6)/10);
    assert.equal(afternoon.data[i].y,Math.round(shiftTotalMinutes(input.employees[i],'afternoon')/6)/10);
  }
  const tabs=shiftDaypartTabs();
  assert.equal(tabs.actions.length,2);
  assert.equal(tabs.actions[0].targetElements[0].isVisible,true);
  assert.equal(tabs.actions[1].targetElements[1].isVisible,true);
});

test('zero-hour employees remain zero in morning and afternoon native charts',()=>{
  const source=structuredClone(input);
  source.employees[2].morning='—';
  source.employees[2].afternoon='—';
  assert.equal(consolidatedShiftChart(source).data[2].y,0);
  assert.equal(consolidatedAfternoonChart(source).data[2].y,0);
  assert.equal(consolidatedWorkdayChart(source).data[2].y,0);
});

test('short vertical labels preserve source name suffixes and resolve collisions',()=>{
  assert.deepEqual(verticalEmployeeNames(input),[
    'Mạnh','Anh','Tuệ','Hoàng','Long','Bình','Linh','Hiếu'
  ]);
  const sample=structuredClone(input);
  sample.employees[1].name='Nguyễn Quốc Mạnh';
  const labels=verticalEmployeeNames(sample);
  assert.equal(labels[0],'Văn Mạnh');
  assert.equal(labels[1],'Quốc Mạnh');
  assert.equal(new Set(labels).size,8);
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
  tiles.forEach((tile,i)=>{
    assert.equal(tile.minHeight,'84px');
    assert.equal(tile.verticalContentAlignment,'Center');
    assert.equal(tile.items.length,2);
    assert.equal(tile.items[0].type,'RichTextBlock');
    assert.equal(tile.items[0].inlines.length,2);
    assert.equal(tile.items[0].inlines[0].text,'● ');
    assert.equal(tile.items[0].inlines[1].text,
      ['Giờ xác nhận','Tổng công','Công ca sáng','Tỷ lệ ghi nhận'][i]);
    assert.equal(tile.items[1].type,'TextBlock');
    assert.equal(tile.items[1].size,'Large');
    assert.equal(tile.items[1].spacing,'Small');
    assert.equal(JSON.stringify(tile).includes('"type":"Icon"'),false);
    assert.equal(JSON.stringify(tile).includes('"type":"ColumnSet"'),false);
  });
});

test('daily tab selection starts in vertical mode and exposes secondary workdays',()=>{
  const card=buildNativeCard(input,directory);
  assert.equal(section(card,'chart-shift').isVisible,true);
  assert.equal(section(card,'chart-workday').isVisible,false);
  assert.equal(section(card,'native-tab-shift').isVisible,true);
  assert.equal(section(card,'native-tab-workday').isVisible,false);
  assert.equal(section(card,'native-tab-shift').actions[1].targetElements.length,4);
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
  assert.equal(section(card,'chart-shift').items[1].type,'Chart.HorizontalBar');
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
    const p=section(card,'chart-shift').items[1].data[i];
    assert.equal(p.x,String(i+1).padStart(2,'0')+' · '+verticalEmployeeNames(morning)[i]);
    assert.equal(p.y,Math.round(shiftTotalMinutes(e,'morning')/6)/10);
    assert.equal(p.color,'categoricalTeal');
    assert.ok(expected.includes(e.name)&&expected.includes(e.status));
    assert.ok(expected.includes(e.morning==='—'?'—':e.morning.slice(0,5)));
  }
});

test('QA enforces Microsoft Entra account bindings, chart data and payload budget',()=>{
  const card=buildNativeCard(input,directory);
  const qa=auditCard(card,input,directory);
  assert.equal(LAYOUT,'ATTENDANCE_MOBILE_NATIVE_V24_BALANCED_INFO_BARS');
  assert.equal(ROW_VISUAL_REVISION,'V24_MOBILE_HORIZONTAL_SHIFT_BARS_2026_10_08');
  assert.equal(qa.chart_count,3);
  assert.equal(qa.graph_persona_count,0);
  assert.equal(qa.native_microsoft_personas,false);
  assert.equal(qa.verified_Entra_account_count,8);
  assert.equal(qa.image_avatar_count,0);
  assert.equal(qa.graph_avatar_count,0);
  assert.equal(qa.native_account_row_count,0);
  assert.equal(qa.profile_panel_count,0);
  assert.equal(qa.daily_compact_row_count,8);
  assert.equal(qa.daily_horizontal_shift_default,true);
  assert.equal(qa.selector_count,0);
  assert.equal(qa.detail_interaction,'one_collapsible_full_day_details');
  assert.deepEqual(all(card).filter(x=>x.type.startsWith('Chart.')).map(x=>x.type),
    ['Chart.HorizontalBar','Chart.HorizontalBar','Chart.HorizontalBar']);
  assert.equal(qa.shift_chart_count,2);
  assert.equal(qa.shift_chart_type,'Chart.HorizontalBar');
  assert.equal(qa.afternoon_chart_type,'Chart.HorizontalBar');
  assert.equal(qa.workday_chart_type,'Chart.HorizontalBar');
  assert.equal(qa.kpi_tile_min_height,'84px');
  assert.equal(qa.kpi_icon_strategy,'semantic_color_dot_no_native_icon');
  assert.ok(qa.bytes<18000);
});

test('QA does not embed Graph profile photos even if legacy image parameters exist',()=>{
  const avatars=Object.fromEntries(input.employees.map(e=>[
    e.name,'data:image/jpeg;base64,'+'A'.repeat(1800)
  ]));
  const card=buildNativeCard(input,directory,avatars);
  assert.equal(all(card).filter(x=>x.type==='Image').length,0);
  assert.equal(auditCard(card,input,directory,avatars).verified_Entra_account_count,8);
  assert.equal(JSON.stringify(card),JSON.stringify(buildNativeCard(input,directory)));
});

test('tampered compact attendance or chart data is rejected before sending',()=>{
  const card=buildNativeCard(input,directory);
  rows(card)[0].items[2].text='forged@example.invalid';
  assert.throws(()=>auditCard(card,input,directory),/Daily compact row missing|Layout\/data mismatch/);
  const corrupt=buildNativeCard(input,directory);
  section(corrupt,'chart-workday').items[1].data[0].y=99;
  assert.throws(()=>auditCard(corrupt,input,directory),/Layout\/data mismatch/);
  const bad=buildNativeCard(input,directory);
  rows(bad)[0].items[1].text='forged hours';
  assert.throws(()=>auditCard(bad,input,directory),/Daily compact row missing source attendance field|Layout\/data mismatch/);
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
  const shift=section(card,'chart-shift').items[1];
  assert.equal(shift.type,'Chart.HorizontalBar');
  assert.equal(shift.color,'categoricalTeal');
  assert.equal(bars.length,8);
  bars.forEach((bar,i)=>{
    const e=morning.employees[i];
    assert.equal(bar.x,e.name+' · '+e.morning.replace(/ \((\d+h\d{2})\)/g,' · $1')+' · '+e.status);
    assert.equal(shift.data[i].x,String(i+1).padStart(2,'0')+' · '+verticalEmployeeNames(morning)[i]);
    assert.equal(shift.data[i].y,Math.round(shiftTotalMinutes(e,'morning')/6)/10);
    assert.equal(bar.y,workdaysFromMinutes(shiftTotalMinutes(e,'morning')));
  });
  const qa=auditCard(card,morning,directory);
  assert.equal(qa.chart_architecture,'horizontal_workdays_horizontal_morning');
  assert.equal(qa.shift_chart_type,'Chart.HorizontalBar');
  assert.equal(qa.kpi_tile_min_height,'84px');
  assert.equal(qa.kpi_icon_strategy,'semantic_color_dot_no_native_icon');
});
