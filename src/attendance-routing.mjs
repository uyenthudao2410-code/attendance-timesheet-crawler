export const ATTENDANCE_TEST_CHAT_ID = "19:0e02d613cded448892f27d74cff19d63@thread.v2";
export const ATTENDANCE_AI_HANDOFF_CHAT_ID = "19:6050abd65a654287b59619ee92ff6cd3@thread.v2";
export const ATTENDANCE_AI_HANDOFF_MARKER = "ATTENDANCE_AI_HANDOFF_V3";
export const ATTENDANCE_EXPECTED_GRAPH_USER = "info@stacorp.net";
export const ATTENDANCE_DIRECT_IMAGE_SCHEMA_VERSION = 3;

export function assertAttendanceRouteIsolation() {
  if (ATTENDANCE_AI_HANDOFF_CHAT_ID === ATTENDANCE_TEST_CHAT_ID) {
    throw new Error("Attendance AI handoff chat must never equal the TEST publication chat");
  }
  return true;
}

export function validateChatGptDirectImageTrigger(trigger) {
  if (!trigger || trigger.schema_version !== ATTENDANCE_DIRECT_IMAGE_SCHEMA_VERSION) {
    throw new Error("Invalid direct ChatGPT Image post trigger schema");
  }
  if (trigger.enabled !== true) return { enabled: false };

  if (String(trigger.mode || "").toUpperCase() !== "TEST") {
    throw new Error("AI post remains locked to TEST mode");
  }
  if (trigger.target_type !== "chat" || String(trigger.chat_id || "") !== ATTENDANCE_TEST_CHAT_ID) {
    throw new Error("AI post TEST target mismatch");
  }

  const transportTest = trigger.transport_test === true;
  if (transportTest) {
    if (String(trigger.image_origin || "") !== "transport_test_fixture") {
      throw new Error("Transport test must use the explicit transport-test fixture origin");
    }
    if (trigger.direct_output !== false || trigger.fallback_renderer_used !== true) {
      throw new Error("Transport test flags are inconsistent");
    }
    if (String(trigger.qa_status || "") !== "transport_only") {
      throw new Error("Transport test must use qa_status=transport_only");
    }
  } else {
    if (String(trigger.image_origin || "") !== "chatgpt_image") {
      throw new Error("Attendance publication accepts ChatGPT Image output only");
    }
    if (trigger.direct_output !== true) {
      throw new Error("Final attendance image must be the direct ChatGPT Image output");
    }
    if (trigger.edited_after_generation !== false) {
      throw new Error("Editing, overlaying, cropping, compositing, or re-rendering after ChatGPT generation is forbidden");
    }
    if (trigger.fallback_renderer_used !== false) {
      throw new Error("Fallback renderer is forbidden for attendance publication");
    }
    if (String(trigger.qa_status || "") !== "passed") {
      throw new Error("Direct ChatGPT Image exact-data QA has not passed");
    }
  }

  if (String(trigger.source_handoff_chat_id || "") !== ATTENDANCE_AI_HANDOFF_CHAT_ID) {
    throw new Error("AI post source must be the isolated technical handoff chat");
  }
  if (String(trigger.source_handoff_marker || "") !== ATTENDANCE_AI_HANDOFF_MARKER) {
    throw new Error("Invalid attendance AI handoff marker");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(trigger.source_prompt_sha256 || ""))) {
    throw new Error("Missing or invalid source prompt SHA-256");
  }

  const slot = String(trigger.slot || "").trim();
  const date = String(trigger.target_date || "").trim();
  const fileName = String(trigger.file_name || "").trim();

  if (!["morning_1230", "daily_2105"].includes(slot)) throw new Error("Invalid AI post slot");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid AI post target date");

  const expectedName = transportTest
    ? (slot === "morning_1230" ? `attendance-morning-${date}-transport-test.png` : `attendance-daily-${date}-transport-test.png`)
    : (slot === "morning_1230" ? `attendance-morning-${date}-chatgpt-direct.png` : `attendance-daily-${date}-chatgpt-direct.png`);

  if (fileName !== expectedName) {
    throw new Error(`AI image filename must identify the untouched direct ChatGPT output: ${expectedName}`);
  }

  if (!String(trigger.drive_id || "").trim() || !String(trigger.item_id || "").trim()) {
    throw new Error("Missing SharePoint/OneDrive drive or item id");
  }
  if (!String(trigger.source_handoff_message_id || "").trim()) {
    throw new Error("Missing source handoff message id");
  }

  const summary = trigger.summary;
  if (!summary || Number(summary.total_employees) !== 8) {
    throw new Error("Attendance publication summary must contain exactly 8 employees");
  }
  for (const key of ["recorded_count", "attention_count", "attendance_rate"]) {
    if (!Number.isFinite(Number(summary[key]))) {
      throw new Error(`Invalid publication summary field: ${key}`);
    }
  }
  if (slot === "daily_2105" && !Number.isFinite(Number(summary.with_record_count))) {
    throw new Error("Daily publication summary is missing with_record_count");
  }

  const recorded = Number(summary.recorded_count);
  const attention = Number(summary.attention_count);
  const rate = Number(summary.attendance_rate);
  if (recorded < 0 || recorded > 8 || attention < 0 || attention > 8 || rate < 0 || rate > 100) {
    throw new Error("Attendance publication summary values are out of range");
  }
  if (!String(summary.total_hours_text || "").trim()) {
    throw new Error("Missing publication total hours text");
  }

  return { enabled: true, slot, date, fileName, summary, transportTest };
}
