import fs from 'node:fs';
import path from 'node:path';
import { decodeImageInput, sha256 } from '../src/attendance-image-input.mjs';
const [source,directory,messageId]=process.argv.slice(2);
if(!source||!directory||!/^\d+$/.test(messageId||''))throw new Error('Usage: node scripts/prepare-chatgpt-image-input.mjs handoff.txt output-dir source-message-id');
const text=fs.readFileSync(source,'utf8');
if(text.split('PROMPT_BEGIN').length!==2)throw new Error('Missing/duplicate prompt boundary');
const metadata=text.split('PROMPT_BEGIN')[0];
// Teams connectors may join lines; metadata tokens are whitespace-delimited.
const field=(name)=>{
  const values=[...metadata.matchAll(new RegExp(`(?:^|\\s)${name}=([^\\s]+)`,'g'))];
  if(values.length!==1)throw new Error(`Missing/duplicate ${name}`);
  return values[0][1].trim();
};
const start='INPUT_GZIP_BASE64_BEGIN',end='INPUT_GZIP_BASE64_END';
if(text.split(start).length!==2||text.split(end).length!==2)throw new Error('Missing/duplicate lossless input envelope');
const encoded=text.split(start)[1].split(end)[0];
const input=decodeImageInput(encoded,{
  request_id:field('REQUEST_ID'),slot:field('SLOT'),target_date:field('TARGET_DATE'),
  generation_prompt_sha256:field('PROMPT_SHA256'),data_sha256:field('DATA_SHA256'),
});
if(sha256(JSON.stringify(input))!==field('INPUT_SHA256'))throw new Error('Whole input SHA-256 mismatch');
if(input.source_report_sha256!==field('SOURCE_REPORT_SHA256'))throw new Error('Source report mismatch');
if(input.generation_prompt_bytes!==Number(field('PROMPT_BYTES')))throw new Error('Prompt byte count mismatch');
fs.mkdirSync(directory,{recursive:true,mode:0o700});
fs.writeFileSync(path.join(directory,'image-input.json'),JSON.stringify(input,null,2)+'\n',{mode:0o600});
fs.writeFileSync(path.join(directory,'generation-prompt.txt'),input.generation_prompt,{mode:0o600});
const receipt={input_gate:'passed',input_contract_version:input.input_contract_version,
  source_handoff_message_id:messageId,request_id:input.request_id,slot:input.slot,target_date:input.target_date,
  source_report_sha256:input.source_report_sha256,source_data_sha256:input.data_sha256,
  source_prompt_sha256:input.generation_prompt_sha256,prompt_bytes:input.generation_prompt_bytes,
  employee_count:input.display.employees.length,kpi_count:input.display.kpis.length,
  image_generated:false,image_qa_status:'pending',teams_posted:false};
fs.writeFileSync(path.join(directory,'input-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(receipt));
