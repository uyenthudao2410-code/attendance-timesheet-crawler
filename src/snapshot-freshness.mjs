export const DEFAULT_MAX_SOURCE_AGE_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_REPORT_AGE_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_IMAGE_AGE_MS = 5 * 60 * 1000;
export const CLOCK_SKEW_MS = 2 * 60 * 1000;

function parseIso(value, label) {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) throw new Error(`${label} is invalid`);
  return ms;
}

export function validateFreshPublication({
  trigger,
  report,
  imageMtimeMs = null,
  nowMs = Date.now(),
  maxSourceAgeMs = DEFAULT_MAX_SOURCE_AGE_MS,
  maxReportAgeMs = DEFAULT_MAX_REPORT_AGE_MS,
  maxImageAgeMs = DEFAULT_MAX_IMAGE_AGE_MS,
}) {
  if (!trigger || trigger.schema_version !== 1) throw new Error("Invalid attendance trigger");
  if (!report || report.kind !== "attendance_business_report") throw new Error("Invalid attendance business report");

  const requestId = String(trigger.request_id || "").trim();
  const requestedAt = String(trigger.requested_at || "").trim();
  if (!requestId || report.request_id !== requestId) throw new Error("Attendance report request_id mismatch");
  if (!requestedAt || report.requested_at !== requestedAt) throw new Error("Attendance report requested_at mismatch");
  if (report.slot !== trigger.slot || report.date !== trigger.target_date) {
    throw new Error("Attendance report slot/date mismatch");
  }

  const requestedAtMs = parseIso(requestedAt, "Trigger requested_at");
  const sourceMs = parseIso(report.source_generated_at, "Report source_generated_at");
  const reportMs = parseIso(report.generated_at, "Report generated_at");

  if (sourceMs + 1000 < requestedAtMs) throw new Error("Attendance source predates the current request");
  if (reportMs + 1000 < sourceMs) throw new Error("Attendance report predates its source snapshot");
  if (sourceMs > nowMs + CLOCK_SKEW_MS || reportMs > nowMs + CLOCK_SKEW_MS) {
    throw new Error("Attendance snapshot timestamp is unexpectedly in the future");
  }
  if (nowMs - sourceMs > maxSourceAgeMs) throw new Error("Attendance source snapshot is stale");
  if (nowMs - reportMs > maxReportAgeMs) throw new Error("Attendance business report is stale");

  if (imageMtimeMs != null) {
    if (!Number.isFinite(imageMtimeMs)) throw new Error("Attendance image mtime is invalid");
    if (imageMtimeMs + 2000 < reportMs) throw new Error("Attendance image predates the current report");
    if (imageMtimeMs > nowMs + CLOCK_SKEW_MS) throw new Error("Attendance image timestamp is unexpectedly in the future");
    if (nowMs - imageMtimeMs > maxImageAgeMs) throw new Error("Attendance image is stale");
  }

  return {
    request_id: requestId,
    requested_at: requestedAt,
    source_generated_at: report.source_generated_at,
    report_generated_at: report.generated_at,
    source_age_ms: nowMs - sourceMs,
    report_age_ms: nowMs - reportMs,
    image_age_ms: imageMtimeMs == null ? null : nowMs - imageMtimeMs,
  };
}
