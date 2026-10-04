export const ATTENDANCE_TEST_CHAT_ID = "19:0e02d613cded448892f27d74cff19d63@thread.v2";
export const ATTENDANCE_AI_HANDOFF_CHAT_ID = "19:6050abd65a654287b59619ee92ff6cd3@thread.v2";
export const ATTENDANCE_AI_HANDOFF_MARKER = "ATTENDANCE_AI_HANDOFF_V3";
export const ATTENDANCE_EXPECTED_GRAPH_USER = "info@stacorp.net";

export function assertAttendanceRouteIsolation() {
  if (ATTENDANCE_AI_HANDOFF_CHAT_ID === ATTENDANCE_TEST_CHAT_ID) {
    throw new Error("Attendance AI handoff chat must never equal the TEST publication chat");
  }
  return true;
}

export function validateChatGptImageTrigger(trigger) {
  if (!trigger || trigger.schema_version !== 2) throw new Error("Invalid AI post trigger schema");
  if (trigger.enabled !== true) return { enabled: false };

  if (String(trigger.mode || "").toUpperCase() !== "TEST") {
    throw new Error("AI post remains locked to TEST mode");
  }
  if (trigger.target_type !== "chat" || String(trigger.chat_id || "") !== ATTENDANCE_TEST_CHAT_ID) {
    throw new Error("AI post TEST target mismatch");
  }
  if (String(trigger.image_origin || "") !== "chatgpt_image") {
    throw new Error("Attendance publication accepts ChatGPT Image output only");
  }
  if (String(trigger.qa_status || "") !== "passed") {
    throw new Error("ChatGPT Image exact-data QA has not passed");
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
  const expectedName = slot === "morning_1230"
    ? `attendance-morning-${date}-chatgpt.png`
    : `attendance-daily-${date}-chatgpt.png`;
  if (fileName !== expectedName) {
    throw new Error(`AI image filename must be exact ChatGPT final filename: ${expectedName}`);
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
    if (!Number.isFinite(Number(summary[key]))) throw new Error(`Invalid publication summary field: ${key}`);
  }
  if (!String(summary.total_hours_text || "").trim()) {
    throw new Error("Missing publication total hours text");
  }

  return { enabled: true, slot, date, fileName, summary };
}
