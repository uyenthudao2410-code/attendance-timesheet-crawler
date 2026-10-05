import test from 'node:test';
import assert from 'node:assert/strict';
import {buildImageInput, validateImageInput, encodeImageInput, decodeImageInput, sha256, IMAGE_CONTEXT_VERSION} from '../src/attendance-image-input.mjs';

// Synthetic fixture: no live attendance roster is stored in the public repository.
function fixture(daily = true) {
  const employees = Array.from({length:8}, (_,i) => ({
    name:`Test employee ${i+1}`, status:'Recorded', status_code:'recorded',
    morning_text:i===2?'07:02\u201307:03 (0h01); 09:24\u201311:26 (2h02)':'\u2014',
    afternoon_text:i===2?'13:35\u201317:49 (4h14)':'\u2014', total_display:i===2?'6h17':'\u2014',
    check_in:'09:24', check_out:'11:26', duration:'2h02', work_rate_percent:51,
  }));
  const slot = daily?'daily_2105':'morning_1230';
  const report = {kind:'attendance_business_report', timezone:'Asia/Ho_Chi_Minh', slot, date:'2026-10-04',
    request_id:'input-test-request', source_generated_at:'2026-10-05T05:17:00Z', employees};
  const request = {slot, date:report.date, date_text:'Test date 04/10/2026', updated_time_text:'12:17',
    spec_version:'ATTENDANCE_AI_VISUAL_V9_MOBILE_STRICT_DATA_2026_10_05',
    data:{total_employees:8, with_record_count:3, recorded_count:3, attendance_rate:38, missing_count:5, review_count:0,
      total_hours_text:'24h56', average_hours_text:'8h19', employees}};
  request.prompt = [
    'EYEBROW: "HR"', 'TITLE: "Full report"', 'SUBTITLE: "Source reconciliation"',
    `DATE: "${request.date_text}"`, 'UPDATE: "Updated 12:17"',
    'FOUR KPI CARDS \u2014 COPY EXACTLY:', '1) "Total" = 8', '2) "With record" = 3',
    `3) "${daily?'Closed':'Attention'}" = ${daily?3:5}`, '4) "Rate" = 38%',
    'SUMMARY STRIP \u2014 COPY EXACTLY:', '"Hours: 24h56"', '"Average: 8h19"',
    'OVERVIEW \u2014 COPY EXACTLY:', ...Array.from({length:daily?6:5}, (_,i)=>`"Overview ${i+1}"`),
    'DETAIL SECTION TITLE: "Details"', 'Required fields in this order whenever shown as columns:',
    daily?'Index | Name | Morning | Afternoon | Total | Status':'Index | Name | Status | In | Out | Duration | Rate',
    'FOOTER: "Reconciliation only"',
  ].join('\n');
  return {request, report, expected:structuredClone(request), hash:sha256(JSON.stringify(report))};
}
function make(f=fixture()){return buildImageInput(f.request, f.report, f.expected, f.hash);}
test('full-day data-first input preserves every session and missing cell',()=>{
  const input=make();
  assert.equal(input.display.employees.length,8);
  assert.equal(input.display.employees[2][2],'07:02\u201307:03 (0h01); 09:24\u201311:26 (2h02)');
  assert.equal(input.display.employees[0][2],'\u2014');
  assert.equal(input.display.employees[2][4],'6h17');
  assert.deepEqual(input.display.kpis.map(k=>k.value),['8','3','3','38%']);
  assert.equal(input.image_context_contract_version, IMAGE_CONTEXT_VERSION);
  assert.match(input.generation_prompt,/^BEGIN_ISOLATED_IMAGE_REQUEST/m);
  assert.match(input.generation_prompt,/CONTEXT_VERSION=ATTENDANCE_IMAGEGEN_ISOLATED_CONTEXT_V1/);
  assert.match(input.generation_prompt,/REQUEST_FINGERPRINT=[a-f0-9]{16}/);
  assert(input.generation_prompt.indexOf('DATA_INPUT_BEGIN') < input.generation_prompt.indexOf('ART DIRECTION'));
  assert.match(input.generation_prompt,/every earlier conversation message, image, visual example/i);
  assert(validateImageInput(input));
});
test('morning has separate 7-field contract',()=>{
  const input=make(fixture(false)); assert.equal(input.display.columns.length,7);
  assert.deepEqual(input.display.kpis.map(k=>k.value),['8','3','5','38%']);
  assert.equal(input.display.employees[0][6],'51%');
});
for(const [name,mutate] of [
  ['changed name', f=>f.request.data.employees[0].name='Wrong name'],
  ['changed session', f=>f.request.data.employees[2].morning_text='08:00-12:00'],
  ['missing employee', f=>f.request.data.employees.pop()],
  ['changed KPI', f=>f.request.data.recorded_count=8],
  ['changed status', f=>f.request.data.employees[2].status='Full day'],
  ['wrong date', f=>f.request.date='2026-10-03'],
  ['wrong slot', f=>f.request.slot='morning_1230'],
  ['old update time', f=>f.request.updated_time_text='07:28'],
  ['summary instead of original prompt', f=>f.request.prompt='Create report with all supplied data'],
]) test(`reject ${name}`,()=>{const f=fixture();mutate(f);assert.throws(()=>make(f),/IMAGE_INPUT_GATE/);});
test('reject omitted KPI block even with matched request',()=>{
  const f=fixture(); f.request.prompt=f.request.prompt.replace('4) "Rate" = 38%','');f.expected=structuredClone(f.request);
  assert.throws(()=>make(f),/4 KPI/);
});
test('lossless gzip/base64 transport and wrapping',()=>{
  const input=make(),encoded=encodeImageInput(input);
  assert.deepEqual(decodeImageInput(encoded.match(/.{1,76}/g).join('\n'),{request_id:input.request_id}),input);
  assert.throws(()=>decodeImageInput(encoded,{target_date:'2026-10-03'}),/Handoff mismatch/);
});
test('reject mutated data, prompt, bytes, and prompt rewrite even with new hash',()=>{
  for(const kind of ['data','prompt','bytes','rewrite']){
    const input=make();
    if(kind==='data')input.display.employees[0][1]='Changed';
    if(kind==='prompt')input.generation_prompt+=' stale data';
    if(kind==='bytes')input.generation_prompt_bytes+=1;
    if(kind==='rewrite'){
      input.generation_prompt='A shorter description';input.generation_prompt_sha256=sha256(input.generation_prompt);
      input.generation_prompt_bytes=Buffer.byteLength(input.generation_prompt);
    }
    assert.throws(()=>validateImageInput(input),/IMAGE_INPUT_GATE/);
  }
});
test('reject report roster reorder',()=>{
  const f=fixture();[f.report.employees[0],f.report.employees[1]]=[f.report.employees[1],f.report.employees[0]];
  // Restore independent request fixture since the synthetic report shares rows.
  const g=fixture();g.report.employees=f.report.employees;
  assert.throws(()=>make(g),/order\/name/);
});

test('reject missing or downgraded image context contract',()=>{
  for(const value of [undefined,'ATTENDANCE_IMAGEGEN_ISOLATED_CONTEXT_V0']){
    const input=make();
    if(value===undefined) delete input.image_context_contract_version; else input.image_context_contract_version=value;
    assert.throws(()=>validateImageInput(input),/image context contract/i);
  }
});
test('isolated prompt fingerprints the exact display data and forbids prior context',()=>{
  const input=make(fixture(false));
  assert(input.generation_prompt.includes(input.data_sha256.slice(0,16)));
  assert.match(input.generation_prompt,/Use ONLY the DATA_INPUT block/i);
  assert.match(input.generation_prompt,/You MAY create exactly one short Vietnamese motivational attendance slogan/i);
  assert.match(input.generation_prompt,/Background is intentionally FLEXIBLE/i);
  assert.match(input.generation_prompt,/never contain a company\/brand name, employee name, date, time, KPI number/i);
  assert.match(input.generation_prompt,/END_ISOLATED_IMAGE_REQUEST$/);
});

test('V10 keeps business data locked while allowing controlled creative freshness',()=>{
  const input=make(fixture(false));
  assert.match(input.generation_prompt,/DATA LOCK - NOT VISIBLE TEXT:/);
  assert.match(input.generation_prompt,/All report data from DATA_INPUT is immutable/i);
  assert.match(input.generation_prompt,/one short Vietnamese motivational attendance slogan/i);
  assert.match(input.generation_prompt,/up to three very short nonnumeric attendance-themed cue badges/i);
  assert.match(input.generation_prompt,/realistic, bright, modern office\/workspace atmosphere/i);
  assert.match(input.generation_prompt,/Do not place readable random text, random numbers, fake dates\/times, signage, logos or company names/i);
  assert.match(input.generation_prompt,/Do not add a second report, second page/i);
});
