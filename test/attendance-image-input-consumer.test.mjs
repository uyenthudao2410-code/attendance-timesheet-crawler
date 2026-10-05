import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildAiVisualRequest} from '../src/attendance-ai-visual.mjs';
import {buildImageInput,encodeImageInput,sha256} from '../src/attendance-image-input.mjs';

function inputFixture(){
  const report={kind:'attendance_business_report',slot:'daily_2105',date:'2026-10-04',
    timezone:'Asia/Ho_Chi_Minh',request_id:'synthetic-consumer-test',
    generated_at:'2026-10-05T05:17:00Z',source_generated_at:'2026-10-05T05:17:00Z',
    employees:Array.from({length:8},(_,i)=>({name:`Synthetic employee ${i+1}`,sessions:[],
      total_minutes:null,total_display:'\u2014',status_code:'not_recorded'}))};
  const request=buildAiVisualRequest(report);
  return buildImageInput(request,report,buildAiVisualRequest(report),sha256(JSON.stringify(report)));
}
function handoff(input){return [
  'ATTENDANCE_AI_HANDOFF_V3',`REQUEST_ID=${input.request_id}`,`SLOT=${input.slot}`,`TARGET_DATE=${input.target_date}`,
  `INPUT_SHA256=${sha256(JSON.stringify(input))}`,`SOURCE_REPORT_SHA256=${input.source_report_sha256}`,`CONTEXT_VERSION=${input.image_context_contract_version}`,
  `DATA_SHA256=${input.data_sha256}`,`PROMPT_SHA256=${input.generation_prompt_sha256}`,`PROMPT_BYTES=${input.generation_prompt_bytes}`,
  'PROMPT_BEGIN',input.generation_prompt,'PROMPT_END','INPUT_GZIP_BASE64_BEGIN',encodeImageInput(input),'INPUT_GZIP_BASE64_END',
].join('\n');}
const cli=new URL('../scripts/prepare-chatgpt-image-input.mjs',import.meta.url).pathname;
test('consumer CLI accepts real connector joined metadata and preserves exact prompt bytes',()=>{
  const input=inputFixture(),root=mkdtempSync(path.join(tmpdir(),'attendance-input-test-'));
  try{
    const source=path.join(root,'handoff.txt'),out=path.join(root,'output');
    writeFileSync(source,handoff(input).replaceAll('\n',' '));
    const receipt=JSON.parse(execFileSync(process.execPath,[cli,source,out,'123456789'],{encoding:'utf8'}));
    assert.equal(receipt.input_gate,'passed');
    assert.equal(receipt.source_handoff_message_id,'123456789');
    assert.equal(readFileSync(path.join(out,'generation-prompt.txt'),'utf8'),input.generation_prompt);
    assert.equal(readFileSync(path.join(out,'imagegen-context.txt'),'utf8'),input.generation_prompt);
    assert.equal(receipt.image_context_contract_version,input.image_context_contract_version);
    assert.equal(receipt.context_ready,true);
    assert.equal(receipt.image_generated,false);
    assert.equal(receipt.image_qa_status,'pending');
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('consumer CLI rejects duplicated metadata on joined lines',()=>{
  const input=inputFixture(),root=mkdtempSync(path.join(tmpdir(),'attendance-input-duplicate-'));
  try{
    const source=path.join(root,'handoff.txt'),out=path.join(root,'output');
    writeFileSync(source,`SLOT=${input.slot} `+handoff(input).replaceAll('\n',' '));
    assert.throws(()=>execFileSync(process.execPath,[cli,source,out,'123456789'],{stdio:'pipe'}));
  }finally{rmSync(root,{recursive:true,force:true});}
});
