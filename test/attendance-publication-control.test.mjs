import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLICATION_VERSION, QA_FIELDS, summaryDigest, validatePublicationBinding, deliveryDecision, expectedTargetDate } from '../src/attendance-publication-control.mjs';
import { request, createRepoStore } from '../src/attendance-delivery-io.mjs';
const now = Date.parse('2026-10-05T07:00:00+07:00');
function fixture() {
  const h = 'a'.repeat(64);
  const summary = {total_employees:8, with_record_count:3, recorded_count:3, attention_count:5, attendance_rate:38, total_hours_text:'24h56'};
  const state = {publication_contract_version:PUBLICATION_VERSION, input_gate:'passed', crawl_complete:true, crawl_employee_count:8, slot:'daily_2105', target_date:'2026-10-04', request_id:'test-request',run_id:'123',teams_self_handoff_message_id:'456',report_sha256:h,ai_visual_request_sha256:h,source_data_sha256:h,source_input_sha256:h,publication_summary_sha256:summaryDigest(summary,'daily_2105')};
  const trigger = {publication_contract_version:PUBLICATION_VERSION,input_gate:'passed',slot:state.slot,target_date:state.target_date,source_request_id:state.request_id,source_run_id:state.run_id,source_handoff_message_id:'456',source_report_sha256:h,source_prompt_sha256:h,source_data_sha256:h,source_input_sha256:h,image_sha256:h,requested_at:new Date(now).toISOString(),summary,qa_status:'passed',generation_id:'test-generation',qa_evidence:{image_sha256:h,source_data_sha256:h,checked_fields:[...QA_FIELDS]}};
  return {state,trigger};
}
test('fresh complete evidence passes',()=>{const {trigger,state}=fixture();assert.equal(validatePublicationBinding(trigger,state,now),'daily_2105-2026-10-04');});
for(const key of ['target_date','slot','source_request_id','source_run_id','source_handoff_message_id','source_report_sha256','source_prompt_sha256','source_data_sha256','source_input_sha256']) test(`reject changed ${key}`,()=>{const {trigger,state}=fixture();trigger[key]='wrong';assert.throws(()=>validatePublicationBinding(trigger,state,now));});
test('reject summary substitution',()=>{const {trigger,state}=fixture();trigger.summary.attention_count=3;assert.throws(()=>validatePublicationBinding(trigger,state,now),/Summary differs/);});
test('input pass cannot substitute for visual QA',()=>{const {trigger,state}=fixture();trigger.qa_status='pending';assert.throws(()=>validatePublicationBinding(trigger,state,now));});
test('reject different image after QA',()=>{const {trigger,state}=fixture();trigger.image_sha256='b'.repeat(64);assert.throws(()=>validatePublicationBinding(trigger,state,now));});
test('reject partial checklist',()=>{const {trigger,state}=fixture();trigger.qa_evidence.checked_fields=['date'];assert.throws(()=>validatePublicationBinding(trigger,state,now));});
test('reject old trigger',()=>{const {trigger,state}=fixture();trigger.requested_at='2026-10-04T00:00:00Z';assert.throws(()=>validatePublicationBinding(trigger,state,now));});
test('old input contracts fail closed',()=>{const {trigger,state}=fixture();delete state.publication_contract_version;assert.throws(()=>validatePublicationBinding(trigger,state,now));});
test('Vietnam midnight and year boundary',()=>{const t=Date.parse('2026-12-31T17:01:00Z');assert.equal(expectedTargetDate('daily_2105',t),'2026-12-31');assert.equal(expectedTargetDate('morning_1230',t),'2027-01-01');});
test('already sent is never resent',()=>{assert.equal(deliveryDecision({publication_key:'key',status:'sent',message_id:'123'},'key'),'already_sent');});
test('ambiguous sends fail closed, explicit rejection can retry',()=>{for(const status of ['sending','uncertain'])assert.throws(()=>deliveryDecision({publication_key:'key',status},'key'),/DELIVERY_UNCERTAIN/);assert.equal(deliveryDecision({publication_key:'key',status:'rejected'},'key'),'send');});
test('GET retry is bounded',async()=>{let n=0;const r=await request('https://example.invalid',{}, {retrySafe:true,sleep:async()=>{},fetchImpl:async()=>new Response('',{status:++n<3?503:200})});assert.equal(n,3);assert.equal(r.status,200);});
test('POST timeout is not retried',async()=>{let n=0;await assert.rejects(request('https://example.invalid',{method:'POST'},{sleep:async()=>{},fetchImpl:async()=>{n++;throw new Error('timeout');}}));assert.equal(n,1);});
test('POST 503 is not retried',async()=>{let n=0;await request('https://example.invalid',{method:'POST'},{sleep:async()=>{},fetchImpl:async()=>{n++;return new Response('',{status:503});}});assert.equal(n,1);});
test('retry-safe GET 429 honors retry-after without unbounded looping',async()=>{let n=0;const waits=[];await request('https://example.invalid',{method:'GET'},{retrySafe:true,sleep:async(ms)=>waits.push(ms),fetchImpl:async()=>{n++;return new Response('',{status:429,headers:{'retry-after':'2'}});}});assert.equal(n,3);assert.deepEqual(waits,[2000,2000]);});
test('lease conflict never overwrites another owner',async()=>{const calls=[];const store=createRepoStore('owner/repo','test',async(url,init)=>{calls.push(init.method||'GET');return init.method==='PUT'?new Response('',{status:409}):Response.json({sha:'other',content:Buffer.from(JSON.stringify({owner:'other'})).toString('base64')});});await assert.rejects(store.write('state.json',{owner:'me'},null,'test'));assert.deepEqual(calls,['PUT','GET']);});
test('recover PUT response loss by readback, not another PUT',async()=>{const value={owner:'me'};let writes=0;const store=createRepoStore('owner/repo','test',async(url,init)=>{if(init.method==='PUT'){writes++;throw new Error('lost response');}return Response.json({sha:'new',content:Buffer.from(JSON.stringify(value)).toString('base64')});});assert.equal((await store.write('state.json',value,null,'test')).sha,'new');assert.equal(writes,1);});

test('both report types copy literal summary values without attendance arithmetic',async()=>{
  const {summaryFromInput}=await import('../src/attendance-publication-control.mjs');
  const d={employees:Array(8).fill([]),kpis:[{value:'8'},{value:'3'},{value:'3'},{value:'38%'}],hours:['Total: 24h56'],overview:['C\u00f3 5 nh\u00e2n s\u1ef1']};
  assert.deepEqual(summaryFromInput({slot:'daily_2105',display:d}),fixture().trigger.summary);
  d.kpis[2].value='5';d.hours[0]='Total: 10h44';
  assert.deepEqual(summaryFromInput({slot:'morning_1230',display:d}),{total_employees:8,recorded_count:3,attention_count:5,attendance_rate:38,total_hours_text:'10h44'});
});
for(const status of ['queued','in_progress','completed'])test(`reject unconfirmed producer ${status}`,async()=>{
 const store=createRepoStore('owner/repo','test',async()=>Response.json({status,conclusion:'failure',name:'Attendance Crawl',head_branch:'main'}));
 await assert.rejects(store.successfulRun('123'),/PRODUCER_NOT_SUCCESSFUL/);
});
