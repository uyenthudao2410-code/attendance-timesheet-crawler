import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';

export const IMAGE_INPUT_VERSION = 'ATTENDANCE_CHATGPT_IMAGE_INPUT_V1';
export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const fail = (message) => { throw new Error(`IMAGE_INPUT_GATE: ${message}`); };
const requireText = (value, field) => {
  if (typeof value !== 'string' || !value.length) fail(`Missing string: ${field}`);
  return value;
};
function segment(prompt, start, end) {
  if (prompt.split(start).length !== 2 || prompt.split(end).length !== 2) fail(`Ambiguous block: ${start}`);
  const a = prompt.indexOf(start) + start.length, b = prompt.indexOf(end, a);
  if (b < a) fail(`Missing block end: ${end}`);
  return prompt.slice(a, b);
}
function quotedField(prompt, label) {
  const matches = [...prompt.matchAll(new RegExp(`^${label}: "([^"\\n]+)"$`, 'gm'))];
  if (matches.length !== 1) fail(`Missing or duplicate field: ${label}`);
  return matches[0][1];
}
function quotedLines(block) {
  return block.split('\n').filter((line) => /^".*"$/.test(line)).map((line) => line.slice(1, -1));
}
function generationPrompt(display, slot) {
  const kind = slot === 'daily_2105' ? 'FULL-DAY' : 'MORNING';
  return [
    `Create ONE image using APPROVED ${kind} MOBILE V9 STRICT DATA.`,
    'The following complete input is the ONLY source of all visible text and attendance data.',
    'DATA_INPUT_BEGIN',
    JSON.stringify(display, null, 2),
    'DATA_INPUT_END',
    '',
    'ART DIRECTION - NOT VISIBLE TEXT:',
    'Create from scratch with ChatGPT Image. Ignore every earlier image, sample roster, old report and old update time in the conversation. Do NOT edit or imitate their data.',
    'Use every Vietnamese string value above verbatim. JSON keys are metadata, not visible wording. Do not display DATA_INPUT markers or these instructions.',
    'Priority: exact data, correct report scope, phone readability, then visual polish. Do not compute, round, rename, paraphrase, invent or fill missing values.',
    'Exactly one portrait infographic, preferably 1024x1536 to 9:16. Premium HR/business: fresh bright green, white/light neutrals, navy/blue, restrained gold. Red/orange only for attention.',
    'Large typography and KPI values, generous spacing. A small bright office/greenery illustration is allowed without text or numbers. No logo, brand, slogan, quote or invented text.',
    'Vertical reading order: eyebrow, title, subtitle, date/update, exactly four KPI cards, hours summary, full overview, detail title, all eight employees in the supplied order, footer.',
    'Use compact rows or stacked employee cards. Columns define cell order. Every session and duration must be shown; do not collapse multiple sessions or replace the stated status.',
    'Do not add a second report or page. Check all four KPI label/value pairs, all eight names, every session, total, status, date and update before output.',
    'Output only one polished image. No external renderer and no post-generation text editing.',
  ].join('\n');
}

// expectedRequest must be independently rebuilt from the same canonical report.
export function buildImageInput(request, report, expectedRequest, reportSha) {
  if (!report || report.kind !== 'attendance_business_report') fail('Invalid canonical report');
  if (!['daily_2105','morning_1230'].includes(report.slot)) fail('Invalid report slot');
  if (report.timezone !== 'Asia/Ho_Chi_Minh') fail('Wrong timezone');
  for (const key of ['slot','date','spec_version','date_text','updated_time_text','data','prompt']) {
    if (!isDeepStrictEqual(request?.[key], expectedRequest?.[key])) fail(`Canonical mismatch: ${key}`);
  }
  if (request.slot !== report.slot || request.date !== report.date) fail('Report identity mismatch');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(report.date)) fail('Invalid target date');
  if (!/^[a-f0-9]{64}$/.test(reportSha)) fail('Invalid report hash');
  requireText(report.request_id, 'request_id');
  if (!Number.isFinite(Date.parse(report.source_generated_at))) fail('Invalid source timestamp');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(request.updated_time_text)) fail('Invalid update time');
  const rows = request.data.employees;
  if (request.data.total_employees !== 8 || rows.length !== 8 || report.employees?.length !== 8) fail('Must have exactly 8 employees');
  if (new Set(rows.map((r) => r.name)).size !== 8) fail('Duplicate employee');
  rows.forEach((r, i) => {
    if (r.name !== report.employees[i].name) fail(`Employee order/name at ${i + 1}`);
  });
  const daily = request.slot === 'daily_2105', p = request.prompt;
  const kpis = [...segment(p, 'FOUR KPI CARDS \u2014 COPY EXACTLY:', 'SUMMARY STRIP \u2014 COPY EXACTLY:')
    .matchAll(/^\d\) "([^"]+)" = ([^\n]+)$/gm)].map((m) => ({ label:m[1], value:m[2] }));
  if (kpis.length !== 4) fail('Must have exactly 4 KPI pairs');
  const expectedKpis = daily
    ? [request.data.total_employees, request.data.with_record_count, request.data.recorded_count, `${request.data.attendance_rate}%`]
    : [request.data.total_employees, request.data.recorded_count, request.data.missing_count + request.data.review_count, `${request.data.attendance_rate}%`];
  if (!isDeepStrictEqual(kpis.map((k) => k.value), expectedKpis.map(String))) fail('KPI values do not match source');
  const hours = quotedLines(segment(p, 'SUMMARY STRIP \u2014 COPY EXACTLY:', 'OVERVIEW \u2014 COPY EXACTLY:'));
  const overview = quotedLines(segment(p, 'OVERVIEW \u2014 COPY EXACTLY:', 'DETAIL SECTION TITLE:'));
  if (hours.length !== 2 || overview.length !== (daily ? 6 : 5)) fail('Incomplete summary/overview');
  const header = /Required fields in this order whenever shown as columns:\n([^\n]+)/.exec(p);
  if (!header) fail('Missing detail column headers');
  const columns = header[1].split('|').map((x) => x.trim());
  if (columns.length !== (daily ? 6 : 7)) fail('Wrong column count');
  const employees = rows.map((r, i) => [String(i + 1), r.name, ...(daily
    ? [r.morning_text, r.afternoon_text, r.total_display, r.status]
    : [r.status, r.check_in, r.check_out, r.duration, `${r.work_rate_percent}%`])]);
  employees.forEach((row, i) => row.forEach((v, j) => requireText(v, `employees[${i}][${j}]`)));
  const display = {
    eyebrow:quotedField(p, 'EYEBROW'), title:quotedField(p, 'TITLE'), subtitle:quotedField(p, 'SUBTITLE'),
    date:quotedField(p, 'DATE'), updated:quotedField(p, 'UPDATE'),
    kpis, hours, overview, detail_title:quotedField(p, 'DETAIL SECTION TITLE'), columns, employees,
    footer:quotedField(p, 'FOOTER'),
  };
  if (display.date !== request.date_text || !display.updated.endsWith(request.updated_time_text)) fail('Displayed date/update mismatch');
  const prompt = generationPrompt(display, request.slot);
  const input = {
    schema_version:1, input_contract_version:IMAGE_INPUT_VERSION,
    request_id:report.request_id, slot:report.slot, target_date:report.date,
    spec_version:request.spec_version, source_generated_at:report.source_generated_at,
    source_report_sha256:reportSha, legacy_prompt_sha256:sha256(p),
    data_sha256:sha256(JSON.stringify(display)), generation_prompt_sha256:sha256(prompt),
    generation_prompt_bytes:Buffer.byteLength(prompt, 'utf8'), display, generation_prompt:prompt,
  };
  validateImageInput(input);
  return input;
}

export function validateImageInput(input, expected = {}) {
  if (input?.schema_version !== 1 || input.input_contract_version !== IMAGE_INPUT_VERSION) fail('Unknown input contract');
  for (const key of ['request_id','slot','target_date','generation_prompt_sha256','data_sha256']) {
    if (expected[key] !== undefined && input[key] !== expected[key]) fail(`Handoff mismatch: ${key}`);
  }
  if (!['daily_2105','morning_1230'].includes(input.slot)) fail('Invalid slot');
  if (input.display?.employees?.length !== 8 || input.display?.kpis?.length !== 4) fail('Input count mismatch');
  const count = input.slot === 'daily_2105' ? 6 : 7;
  if (input.display.columns?.length !== count) fail('Input column count mismatch');
  input.display.employees.forEach((row, i) => {
    if (row.length !== count || row[0] !== String(i + 1)) fail('Input row order/width mismatch');
    row.forEach((v, j) => requireText(v, `row ${i + 1} cell ${j}`));
  });
  if (new Set(input.display.employees.map((row) => row[1])).size !== 8) fail('Input duplicate name');
  if (sha256(JSON.stringify(input.display)) !== input.data_sha256) fail('Data SHA-256 mismatch');
  if (sha256(input.generation_prompt) !== input.generation_prompt_sha256) fail('Prompt SHA-256 mismatch');
  if (Buffer.byteLength(input.generation_prompt, 'utf8') !== input.generation_prompt_bytes) fail('Prompt byte count mismatch');
  if (input.generation_prompt !== generationPrompt(input.display, input.slot)) fail('Prompt is not the exact complete input');
  return true;
}
export function encodeImageInput(input) {
  validateImageInput(input);
  return gzipSync(Buffer.from(JSON.stringify(input), 'utf8')).toString('base64');
}
export function decodeImageInput(encoded, expected = {}) {
  const compact = String(encoded).replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) fail('Invalid input base64');
  const input = JSON.parse(gunzipSync(Buffer.from(compact, 'base64'), {maxOutputLength:128000}).toString('utf8'));
  validateImageInput(input, expected);
  return input;
}
