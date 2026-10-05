import { createHash } from 'node:crypto';

export const PUBLICATION_VERSION = 'ATTENDANCE_PUBLICATION_V1';
export const QA_FIELDS = Object.freeze(['report_type', 'date', 'update_time', 'kpis', 'hours_average', 'overview', 'employee_names_order', 'sessions_durations', 'totals_statuses', 'footer', 'no_extra_text', 'mobile_readability']);
export const digest = (value) => createHash('sha256').update(value).digest('hex');
const fail = (message) => { throw new Error(`PUBLICATION_GATE: ${message}`); };
const hash = (value, field) => { if (!/^[a-f0-9]{64}$/.test(value || '')) fail(`Invalid hash: ${field}`); return value; };
const integerText = (value) => {
  if (!/^\d+$/.test(String(value))) fail('Invalid integer in display contract');
  return Number(value);
};
export function summaryFromInput(input) {
  const d = input.display;
  if (!d || d.kpis?.length !== 4 || d.employees?.length !== 8) fail('Incomplete display contract');
  const daily = input.slot === 'daily_2105';
  if (!daily && input.slot !== 'morning_1230') fail('Invalid slot');
  const rate = /^(\d+)%$/.exec(d.kpis[3].value);
  const total = /: (\d+h\d{2})$/.exec(d.hours?.[0] || '');
  const attention = /^C\u00f3 (\d+) nh\u00e2n s\u1ef1/.exec(d.overview?.at(-1) || '');
  if (!rate || !total || !attention) fail('Missing literal summary fields');
  const result = { total_employees: integerText(d.kpis[0].value) };
  if (daily) result.with_record_count = integerText(d.kpis[1].value);
  result.recorded_count = integerText(d.kpis[daily ? 2 : 1].value);
  result.attention_count = daily ? integerText(attention[1]) : integerText(d.kpis[2].value);
  result.attendance_rate = integerText(rate[1]);
  result.total_hours_text = total[1];
  return result;
}
export function summaryDigest(summary, slot) {
  const keys = ['total_employees', ...(slot === 'daily_2105' ? ['with_record_count'] : []), 'recorded_count', 'attention_count', 'attendance_rate', 'total_hours_text'];
  for (const key of keys.slice(0, -1)) {
    if (!Number.isInteger(summary?.[key]) || summary[key] < 0) fail(`Invalid summary: ${key}`);
  }
  if (summary.total_employees !== 8 || !/^\d+h\d{2}$/.test(summary.total_hours_text)) fail('Invalid summary count/hours');
  return digest(JSON.stringify(Object.fromEntries(keys.map((k) => [k, summary[k]]))));
}
export function publicationKey(slot, date) {
  if (!['daily_2105', 'morning_1230'].includes(slot) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('Invalid publication identity');
  return `${slot}-${date}`;
}
export function expectedTargetDate(slot, now = Date.now()) {
  const local = new Date(now + 7 * 3600000);
  if (slot === 'daily_2105') local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}
export function validatePublicationBinding(trigger, state, now = Date.now()) {
  if (trigger.publication_contract_version !== PUBLICATION_VERSION || state?.publication_contract_version !== PUBLICATION_VERSION) fail('Fresh publication contract required');
  if (trigger.transport_test === true) fail('Transport fixtures cannot publish attendance');
  if (trigger.input_gate !== 'passed' || state.input_gate !== 'passed' || state.crawl_complete !== true || state.crawl_employee_count !== 8) fail('Input/crawl gate not passed');
  for (const key of ['slot', 'target_date']) if (trigger[key] !== state[key]) fail(`Source identity mismatch: ${key}`);
  if (trigger.target_date !== expectedTargetDate(trigger.slot, now)) fail('Wrong publication date');
  const fields = {
    source_request_id: 'request_id', source_run_id: 'run_id', source_handoff_message_id: 'teams_self_handoff_message_id',
    source_report_sha256: 'report_sha256', source_prompt_sha256: 'ai_visual_request_sha256',
    source_data_sha256: 'source_data_sha256', source_input_sha256: 'source_input_sha256',
  };
  for (const [key, sourceKey] of Object.entries(fields)) {
    if (!trigger[key] || String(trigger[key]) !== String(state[sourceKey] || '')) fail(`Source binding mismatch: ${key}`);
    if (key.endsWith('_sha256')) hash(trigger[key], key);
  }
  if (!Number.isFinite(Date.parse(trigger.requested_at)) || Date.parse(trigger.requested_at) > now + 120000 || now - Date.parse(trigger.requested_at) > 3600000) fail('Stale or future post request');
  if (summaryDigest(trigger.summary, trigger.slot) !== hash(state.publication_summary_sha256, 'summary')) fail('Summary differs from verified input');
  hash(trigger.image_sha256, 'image');
  const qa = trigger.qa_evidence;
  if (trigger.qa_status !== 'passed' || qa?.image_sha256 !== trigger.image_sha256 || qa?.source_data_sha256 !== trigger.source_data_sha256) fail('QA is not bound to this image/data');
  if (!Array.isArray(qa.checked_fields) || QA_FIELDS.some((field) => !qa.checked_fields.includes(field))) fail('Incomplete image QA checklist');
  if (typeof trigger.generation_id !== 'string' || !trigger.generation_id.trim()) fail('Missing actual generation/file identifier');
  return publicationKey(trigger.slot, trigger.target_date);
}
export function deliveryDecision(receipt, key) {
  if (!receipt) return 'send';
  if (receipt.publication_key !== key) fail('Receipt identity mismatch');
  if (receipt.status === 'sent' && /^\d+$/.test(receipt.message_id || '')) return 'already_sent';
  if (receipt.status === 'rejected') return 'send';
  fail('DELIVERY_UNCERTAIN: reconcile the existing Teams send before retrying');
}
