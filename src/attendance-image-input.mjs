import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';

export const IMAGE_INPUT_VERSION = 'ATTENDANCE_CHATGPT_IMAGE_INPUT_V1';
export const IMAGE_CONTEXT_VERSION = 'ATTENDANCE_IMAGEGEN_ISOLATED_CONTEXT_V1';
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
function generationPrompt(display, slot, dataSha) {
  const kind = slot === 'daily_2105' ? 'FULL-DAY' : 'MORNING';
  const fingerprint = dataSha.slice(0, 16);
  return [
    'BEGIN_ISOLATED_IMAGE_REQUEST',
    `CONTEXT_VERSION=${IMAGE_CONTEXT_VERSION}`,
    `REQUEST_FINGERPRINT=${fingerprint}`,
    'This image request is self-contained. For THIS image, every earlier conversation message, image, visual example, employee list, date, KPI, attendance record, logo, company name, slogan and layout sample is INVALID context.',
    'Use ONLY the DATA_INPUT block below as the source of attendance/report data. If any earlier context conflicts with DATA_INPUT, ignore the earlier context completely.',
    `Create ONE image using APPROVED ${kind} MOBILE STRICT DATA with FLEXIBLE VISUAL DIRECTION.`,
    'DATA_INPUT_BEGIN',
    JSON.stringify(display, null, 2),
    'DATA_INPUT_END',
    '',
    'DATA LOCK - NOT VISIBLE TEXT:',
    'All report data from DATA_INPUT is immutable: report title/scope, date, update time, all KPI labels and values, hours/average, overview, all employee names and order, every time/session/duration, total/status/work-rate value, section titles and footer.',
    'Copy those supplied data strings exactly. Do not compute, round, rename, normalize, translate, infer, merge sessions, correct source values, fabricate values, fill missing values, or change the em dash.',
    'Show the complete required report content. If visual polish conflicts with exact data, exact data wins.',
    '',
    'CREATIVE TEXT FREEDOM - NOT VISIBLE TEXT:',
    'You MAY create exactly one short Vietnamese motivational attendance slogan to keep the daily visual fresh. It should feel positive, professional and energetic, centered on themes such as punctuality, transparency, initiative, discipline, teamwork or effectiveness.',
    'You MAY also use up to three very short nonnumeric attendance-themed cue badges if they improve the composition.',
    'Creative slogan/cue text must never contain a company/brand name, employee name, date, time, KPI number, attendance value, policy claim or invented factual statement, and must never contradict DATA_INPUT.',
    'Avoid stale/repetitive wording; choose a fresh phrasing for this generation.',
    '',
    'VISUAL FREEDOM - NOT VISIBLE TEXT:',
    'Create from scratch with ChatGPT Image. Do not edit, imitate, or reuse any earlier generated image or screenshot.',
    'Priority: exact data first, correct report scope second, phone readability third, visual freshness and polish fourth.',
    'Exactly one portrait infographic, preferably 1024x1536 to 9:16, optimized for Microsoft Teams phone viewing.',
    'Use a premium modern HR/business visual language with fresh bright green as the lead accent, white/light neutrals, deep navy/professional blue, restrained gold, and red/orange only for attention states.',
    'Background is intentionally FLEXIBLE and should vary naturally between runs: use a realistic, bright, modern office/workspace atmosphere such as daylight through glass, a clean desk, laptop without readable screen text, clipboard/checklist, analog clock, calendar object, greenery, soft city-office depth, or other tasteful attendance/time-management visual motifs.',
    'Keep the background realistic, fresh, attractive and slightly soft-focus where useful. It must remain secondary to the report cards and never reduce legibility.',
    'Do not place readable random text, random numbers, fake dates/times, signage, logos or company names in the background.',
    'Layout may vary: use clean rounded cards, balanced spacing, subtle depth/shadows, modern icons and a clear vertical hierarchy. A table or stacked employee cards are both allowed as long as every locked data field remains readable.',
    'Vertical information order must remain: eyebrow/title/subtitle, date/update, optional slogan, exactly four KPI cards, hours summary, overview, detail section with all eight employees in supplied order, footer.',
    'Do not add a second report, second page, duplicate dashboard, logo, company/brand name, watermark, or extra factual data.',
    'Before output, verify the report type, date, update time, four KPI label/value pairs, hours/average, overview, all eight names in order, every time/session/duration/total/status/work-rate value and footer against DATA_INPUT.',
    'Output only one polished image. No external renderer and no post-generation data/text editing.',
    `REQUEST_FINGERPRINT_END=${fingerprint}`,
    'END_ISOLATED_IMAGE_REQUEST',
  ].join('\\n');
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
  const dataSha = sha256(JSON.stringify(display));
  const prompt = generationPrompt(display, request.slot, dataSha);
  const input = {
    schema_version:1, input_contract_version:IMAGE_INPUT_VERSION, image_context_contract_version:IMAGE_CONTEXT_VERSION,
    request_id:report.request_id, slot:report.slot, target_date:report.date,
    spec_version:request.spec_version, source_generated_at:report.source_generated_at,
    source_report_sha256:reportSha, legacy_prompt_sha256:sha256(p),
    data_sha256:dataSha, generation_prompt_sha256:sha256(prompt),
    generation_prompt_bytes:Buffer.byteLength(prompt, 'utf8'), display, generation_prompt:prompt,
  };
  validateImageInput(input);
  return input;
}

export function validateImageInput(input, expected = {}) {
  if (input?.schema_version !== 1 || input.input_contract_version !== IMAGE_INPUT_VERSION) fail('Unknown input contract');
  if (input.image_context_contract_version !== IMAGE_CONTEXT_VERSION) fail('Unknown image context contract');
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
  const dataSha = sha256(JSON.stringify(input.display));
  if (dataSha !== input.data_sha256) fail('Data SHA-256 mismatch');
  if (sha256(input.generation_prompt) !== input.generation_prompt_sha256) fail('Prompt SHA-256 mismatch');
  if (Buffer.byteLength(input.generation_prompt, 'utf8') !== input.generation_prompt_bytes) fail('Prompt byte count mismatch');
  if (input.generation_prompt !== generationPrompt(input.display, input.slot, dataSha)) fail('Prompt is not the exact isolated complete input');
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
