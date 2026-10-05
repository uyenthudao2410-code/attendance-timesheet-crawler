import fs from 'node:fs/promises';
import path from 'node:path';
import { PUBLICATION_VERSION } from '../src/attendance-publication-control.mjs';
import { IMAGE_CONTEXT_VERSION } from '../src/attendance-image-input.mjs';
const env=(name)=>String(process.env[name]||'').trim();
const slot=env('ATTENDANCE_RUN_SLOT'), date=env('TARGET_DATE');
const requestId=env('ATTENDANCE_REQUEST_ID'), requestedAt=env('ATTENDANCE_REQUESTED_AT');
const runId=env('GITHUB_RUN_ID'), runAttempt=Number(env('GITHUB_RUN_ATTEMPT')||'1');
const artifactId=env('ARTIFACT_ID'), artifactName=env('ARTIFACT_NAME');
const reportFile=env('ATTENDANCE_REPORT_FILE'), reportSha256=env('ATTENDANCE_REPORT_SHA256');
const promptSha256=env('ATTENDANCE_AI_VISUAL_PROMPT_SHA256'), specVersion=env('ATTENDANCE_AI_VISUAL_SPEC_VERSION');
const handoffMessageId=env('ATTENDANCE_AI_HANDOFF_MESSAGE_ID'), handoffPromptSha=env('ATTENDANCE_AI_HANDOFF_PROMPT_SHA256');
const crawlCompletedAt=env('ATTENDANCE_CRAWL_COMPLETED_AT'), crawlEmployeeCount=Number(env('ATTENDANCE_CRAWL_EMPLOYEE_COUNT'));
const dataSha=env('ATTENDANCE_IMAGE_INPUT_DATA_SHA256'), inputSha=env('ATTENDANCE_IMAGE_INPUT_SHA256');
const summarySha=env('ATTENDANCE_PUBLICATION_SUMMARY_SHA256');
if(!['morning_1230','daily_2105'].includes(slot))throw new Error('Unsupported attendance slot');
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d+$/.test(runId)||!/^\d+$/.test(artifactId))throw new Error('Invalid producer identity');
if(!requestId||!Number.isFinite(Date.parse(requestedAt))||!Number.isFinite(Date.parse(crawlCompletedAt)))throw new Error('Invalid producer request timestamps');
if(crawlEmployeeCount!==8)throw new Error('Producer requires 8 employee crawl barrier');
for(const value of [reportSha256,promptSha256,handoffPromptSha,dataSha,inputSha,summarySha])if(!/^[a-f0-9]{64}$/.test(value))throw new Error('Invalid producer hashes');
if(promptSha256!==handoffPromptSha)throw new Error('Prompt differs from handoff');
if(!handoffMessageId||reportFile!==`output/report-${slot}-${date}.json`)throw new Error('Missing producer handoff/report');
if(env('ATTENDANCE_PUBLICATION_VERSION')!==PUBLICATION_VERSION||env('ATTENDANCE_IMAGE_INPUT_VERSION')!=='ATTENDANCE_CHATGPT_IMAGE_INPUT_V1'||env('ATTENDANCE_IMAGE_CONTEXT_VERSION')!==IMAGE_CONTEXT_VERSION)throw new Error('Missing verified input/publication/context contract');
const value={
  schema_version:12,role:'producer',run_id:runId,run_attempt:runAttempt,request_id:requestId,requested_at:requestedAt,
  slot,target_date:date,crawl_complete:true,crawl_employee_count:8,crawl_completed_at:crawlCompletedAt,
  artifact_id:artifactId,artifact_name:artifactName,report_file:reportFile,report_sha256:reportSha256,
  ai_visual_spec_version:specVersion,ai_visual_request_sha256:promptSha256,teams_self_handoff_message_id:handoffMessageId,
  publication_contract_version:PUBLICATION_VERSION,input_contract_version:env('ATTENDANCE_IMAGE_INPUT_VERSION'),image_context_contract_version:IMAGE_CONTEXT_VERSION,input_gate:'passed',
  source_data_sha256:dataSha,source_input_sha256:inputSha,publication_summary_sha256:summarySha,completed_at:new Date().toISOString(),
};
const dir=path.join('.github','attendance-state');await fs.mkdir(dir,{recursive:true});
const out=path.join(dir,`${slot}.json`);await fs.writeFile(out,JSON.stringify(value,null,2)+'\n','utf8');process.stdout.write(out);
