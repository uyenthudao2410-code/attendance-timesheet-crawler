import fs from 'node:fs';
import path from 'node:path';
import { validateImageInput } from '../src/attendance-image-input.mjs';
import { ATTENDANCE_AI_HANDOFF_CHAT_ID, ATTENDANCE_AI_HANDOFF_MARKER, ATTENDANCE_TEST_CHAT_ID, validateChatGptDirectImageTrigger } from '../src/attendance-routing.mjs';
import { PUBLICATION_VERSION, digest, summaryFromInput, validatePublicationBinding } from '../src/attendance-publication-control.mjs';

const [directory, imagePath, qaPath, uploadPath, producerPath, outputPath] = process.argv.slice(2);
if (!outputPath) throw new Error('Usage: node scripts/build-attendance-post-trigger.mjs input-dir direct.png qa.json upload.json producer-state.json trigger.json');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const input = read(path.join(directory, 'image-input.json'));
const receipt = read(path.join(directory, 'input-receipt.json'));
const producer = read(producerPath), qa = read(qaPath), upload = read(uploadPath);
validateImageInput(input);
if (receipt.input_gate !== 'passed' || qa.status !== 'passed' || qa.image_origin !== 'chatgpt_image') throw new Error('Input and independent image QA must both pass');
for (const [key, value] of Object.entries({ request_id: input.request_id, slot: input.slot, target_date: input.target_date, source_report_sha256: input.source_report_sha256, source_data_sha256: input.data_sha256, source_prompt_sha256: input.generation_prompt_sha256 })) {
  if (receipt[key] !== value) throw new Error(`Input receipt mismatch: ${key}`);
}
const image = fs.readFileSync(imagePath);
if (image.length < 24 || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Direct output must be a PNG');
const trigger = {
  schema_version: 3, publication_contract_version: PUBLICATION_VERSION, enabled: true, mode: 'TEST', target_type: 'chat', chat_id: ATTENDANCE_TEST_CHAT_ID,
  image_origin: 'chatgpt_image', direct_output: true, edited_after_generation: false, fallback_renderer_used: false,
  input_gate: 'passed', qa_status: 'passed', generation_id: qa.generation_id,
  source_handoff_chat_id: ATTENDANCE_AI_HANDOFF_CHAT_ID, source_handoff_marker: ATTENDANCE_AI_HANDOFF_MARKER,
  source_handoff_message_id: receipt.source_handoff_message_id,
  source_request_id: input.request_id, source_run_id: producer.run_id, source_report_sha256: input.source_report_sha256,
  source_input_sha256: digest(JSON.stringify(input)), source_data_sha256: input.data_sha256, source_prompt_sha256: input.generation_prompt_sha256,
  slot: input.slot, target_date: input.target_date,
  drive_id: upload.drive_id, item_id: upload.item_id, file_name: upload.file_name,
  image_sha256: digest(image), requested_at: new Date().toISOString(), summary: summaryFromInput(input),
  qa_evidence: { image_sha256: qa.image_sha256, source_data_sha256: qa.source_data_sha256, checked_fields: qa.checked_fields },
};
validateChatGptDirectImageTrigger(trigger);
validatePublicationBinding(trigger, producer);
fs.writeFileSync(outputPath, JSON.stringify(trigger, null, 2) + '\n', {mode:0o600});
console.log('ATTENDANCE_POST_TRIGGER_GATE=PASS');
