const TZ = "Asia/Ho_Chi_Minh";
const MIDDAY_SPLIT_MINUTE = 12 * 60 + 45;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function displayTime(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (!Number.isFinite(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function displayOptionalDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? displayDate(String(value)) : null;
}

function minuteOfDay(value) {
  const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutes(minutes) {
  if (!Number.isInteger(minutes) || minutes < 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${String(mins).padStart(2, "0")}`;
}

function normalizeSession(session) {
  if (!session || typeof session !== "object") return null;
  const input = typeof session.in === "string" ? session.in : null;
  const output = typeof session.out === "string" ? session.out : null;
  const minutes = Number.isInteger(session.minutes) && session.minutes >= 0 ? session.minutes : null;
  if (!input && !output) return null;
  return {
    in: input,
    out: output,
    minutes,
    duration: formatMinutes(minutes),
    duration_consistency: session.duration_consistency ?? null,
    source: session.source ?? null,
  };
}

function employeeSessions(employee) {
  const raw = Array.isArray(employee?.sessions) && employee.sessions.length
    ? employee.sessions
    : [employee?.morning, employee?.afternoon];
  const seen = new Set();
  const sessions = [];
  for (const item of raw) {
    const session = normalizeSession(item);
    if (!session) continue;
    const key = `${session.in ?? ""}|${session.out ?? ""}|${session.minutes ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sessions.push(session);
  }
  return sessions.sort((a, b) => {
    const aa = minuteOfDay(a.in || a.out) ?? Number.POSITIVE_INFINITY;
    const bb = minuteOfDay(b.in || b.out) ?? Number.POSITIVE_INFINITY;
    return aa - bb;
  });
}

function baseEmployee(employee) {
  return {
    name: employee.name,
    data_source: employee.data_source ?? null,
    source_classification: employee.source_classification ?? null,
    access_ok: employee.access_ok !== false,
  };
}

function sourceReviewStatus(employee) {
  const history = employee?.device_history && typeof employee.device_history === "object"
    ? employee.device_history
    : null;
  const historyCount = Number.isInteger(history?.history_record_count) && history.history_record_count >= 0
    ? history.history_record_count
    : null;
  const latestRecordDate = /^\d{4}-\d{2}-\d{2}$/.test(String(history?.latest_record_date || ""))
    ? String(history.latest_record_date)
    : null;
  const earliestRecordDate = /^\d{4}-\d{2}-\d{2}$/.test(String(history?.earliest_record_date || ""))
    ? String(history.earliest_record_date)
    : null;
  const interpretation = typeof history?.interpretation === "string" ? history.interpretation : null;

  if (historyCount === 0 || interpretation === "device_history_empty") {
    return {
      status_code: "source_review",
      status_text: "⚠️ Nguồn chấm công không trả lịch sử – cần cập nhật/đối soát link nguồn",
      source_issue_code: "source_history_empty",
      source_health: {
        history_record_count: historyCount ?? 0,
        latest_record_date: latestRecordDate,
        earliest_record_date: earliestRecordDate,
        interpretation,
      },
    };
  }

  if (historyCount > 0 && latestRecordDate) {
    const latestDisplay = displayOptionalDate(latestRecordDate);
    return {
      status_code: "source_review",
      status_text: `⚠️ Nguồn chấm công chưa có dữ liệu ngày này; lịch sử hiện dừng ở ${latestDisplay} – cần cập nhật/đối soát link nguồn`,
      source_issue_code: "source_history_stale",
      source_health: {
        history_record_count: historyCount,
        latest_record_date: latestRecordDate,
        earliest_record_date: earliestRecordDate,
        interpretation,
      },
    };
  }

  return {
    status_code: "source_review",
    status_text: "⚠️ Nguồn chưa xác nhận được dữ liệu ngày này – cần đối soát nguồn",
    source_issue_code: "source_unresolved",
    source_health: {
      history_record_count: historyCount,
      latest_record_date: latestRecordDate,
      earliest_record_date: earliestRecordDate,
      interpretation,
    },
  };
}

function buildMorningEmployee(employee) {
  const base = baseEmployee(employee);
  if (employee.access_ok === false || employee.status === "technical_error") {
    return {
      ...base,
      morning: null,
      status_code: "technical_error",
      status_text: "Không đọc được app",
    };
  }
  if (employee.status === "date_not_found") {
    return {
      ...base,
      morning: null,
      ...sourceReviewStatus(employee),
    };
  }

  const session = normalizeSession(employee.morning);
  if (employee.status === "review_required") {
    return {
      ...base,
      morning: session,
      status_code: "review_required",
      status_text: "Cần đối soát",
    };
  }
  if (!session) {
    return {
      ...base,
      morning: null,
      status_code: "not_recorded_morning",
      status_text: "⚠️ Chưa ghi nhận ca sáng",
    };
  }
  if (session.in && !session.out) {
    return {
      ...base,
      morning: session,
      status_code: "working",
      status_text: "Đang làm việc",
    };
  }
  if (!session.in && session.out) {
    return {
      ...base,
      morning: session,
      status_code: "review_required",
      status_text: "Cần đối soát – thiếu giờ vào sáng",
    };
  }
  if (session.in && session.out && Number.isInteger(session.minutes)) {
    return {
      ...base,
      morning: session,
      status_code: "recorded",
      status_text: "Đã ghi nhận",
    };
  }
  return {
    ...base,
    morning: session,
    status_code: "review_required",
    status_text: "Cần đối soát – chưa xác nhận thời lượng",
  };
}

function sessionPeriod(session) {
  const anchor = minuteOfDay(session.in || session.out);
  if (anchor == null) return "unknown";
  return anchor < MIDDAY_SPLIT_MINUTE ? "morning" : "afternoon";
}

function missingEndpointText(session) {
  if (session.in && !session.out) return `thiếu giờ ra sau ${session.in}`;
  if (!session.in && session.out) return `thiếu giờ vào trước ${session.out}`;
  return "thiếu mốc chấm công";
}

function crossesMidday(session) {
  const start = minuteOfDay(session.in);
  const end = minuteOfDay(session.out);
  return start != null && end != null && start < MIDDAY_SPLIT_MINUTE && end >= MIDDAY_SPLIT_MINUTE;
}

function buildDailyEmployee(employee) {
  const base = baseEmployee(employee);
  if (employee.access_ok === false || employee.status === "technical_error") {
    return {
      ...base,
      sessions: [],
      total_minutes: null,
      total_display: "—",
      status_code: "technical_error",
      status_text: "Không đọc được app",
    };
  }
  if (employee.status === "date_not_found") {
    return {
      ...base,
      sessions: [],
      total_minutes: null,
      total_display: "—",
      ...sourceReviewStatus(employee),
    };
  }

  const sessions = employeeSessions(employee);
  if (employee.status === "review_required") {
    return {
      ...base,
      sessions,
      total_minutes: null,
      total_display: "Chưa chốt",
      status_code: "review_required",
      status_text: "Cần đối soát",
    };
  }
  if (!sessions.length) {
    return {
      ...base,
      sessions: [],
      total_minutes: null,
      total_display: "—",
      status_code: "not_recorded",
      status_text: "⚠️ Chưa ghi nhận",
    };
  }

  const invalidCompleted = sessions.filter((session) => session.in && session.out && !Number.isInteger(session.minutes));
  if (invalidCompleted.length) {
    return {
      ...base,
      sessions,
      total_minutes: null,
      total_display: "Chưa chốt",
      status_code: "review_required",
      status_text: "Cần đối soát – chưa xác nhận thời lượng",
    };
  }

  const openSessions = sessions.filter((session) => !session.in || !session.out);
  if (openSessions.length) {
    return {
      ...base,
      sessions,
      total_minutes: null,
      total_display: "Chưa chốt",
      status_code: "open_session",
      status_text: `Chưa chốt – ${openSessions.map(missingEndpointText).join("; ")}`,
    };
  }

  const completeSessions = sessions.filter(
    (session) => session.in && session.out && Number.isInteger(session.minutes),
  );
  const totalMinutes = completeSessions.reduce((sum, session) => sum + session.minutes, 0);
  const statusText = completeSessions.length === 1
    ? (crossesMidday(completeSessions[0]) ? "Đã ghi nhận 1 ca liên tục" : "Đã ghi nhận 1 ca")
    : `Đã ghi nhận ${completeSessions.length} ca/phiên`;
  return {
    ...base,
    sessions,
    total_minutes: totalMinutes,
    total_display: formatMinutes(totalMinutes),
    status_code: "recorded",
    status_text: statusText,
  };
}

function renderMorningSession(session) {
  if (!session) return { in: "—", out: "—", duration: "—" };
  return {
    in: session.in || "—",
    out: session.out || "—",
    duration: session.in && session.out && session.duration ? session.duration : "—",
  };
}

function renderSessionCell(sessions) {
  if (!sessions.length) return "—";
  return sessions.map((session) => {
    const pair = `${escapeHtml(session.in || "—")}-${escapeHtml(session.out || "—")}`;
    if (session.in && session.out && session.duration) {
      return `${pair}<br><strong>${escapeHtml(session.duration)}</strong>`;
    }
    return pair;
  }).join("<br>");
}

function morningNotes(rows) {
  const exceptional = rows.filter((row) => !["recorded", "working"].includes(row.status_code));
  if (!exceptional.length) return "Không phát hiện tình trạng cần lưu ý tại thời điểm chụp dữ liệu.";
  return exceptional
    .map((row) => `${escapeHtml(row.name)}: ${escapeHtml(row.status_text)}`)
    .join("<br>");
}

function dailyNotes(rows) {
  const exceptional = rows.filter((row) => row.status_code !== "recorded");
  if (!exceptional.length) return "Không phát hiện tình trạng cần lưu ý trong dữ liệu đã ghi nhận.";
  return exceptional
    .map((row) => `${escapeHtml(row.name)}: ${escapeHtml(row.status_text)}`)
    .join("<br>");
}

function footer() {
  return "<br>ℹ️ Số liệu được tổng hợp từ phần mềm chấm công để <strong>đối soát</strong>, không mặc nhiên là giá trị công chính thức." +
    "<br>Nhân sự phát hiện sai lệch hoặc có vướng mắc cần thông tin ngay <strong>P.HC-NS</strong> để kiểm tra và điều chỉnh.";
}

function renderMorningHtml(date, updatedAt, rows) {
  const body = rows.map((row) => {
    const session = renderMorningSession(row.morning);
    return `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(session.in)}</td><td>${escapeHtml(session.out)}</td><td>${escapeHtml(session.duration)}</td><td>${escapeHtml(row.status_text)}</td></tr>`;
  }).join("");
  return `<strong>📋 BÁO CÁO CHẤM CÔNG CA SÁNG — ${displayDate(date)}</strong>` +
    `<br>Cập nhật: ${displayTime(updatedAt)}` +
    `<br><br><table border="1" cellpadding="6" cellspacing="0"><tr><th>Nhân sự</th><th>Vào sáng</th><th>Tan sáng</th><th>Công sáng</th><th>Trạng thái</th></tr>${body}</table>` +
    `<br><br><strong>Đánh giá &amp; lưu ý</strong><br>${morningNotes(rows)}` + footer();
}

function renderDailyHtml(date, updatedAt, rows) {
  const body = rows.map((row) => {
    const morning = row.sessions.filter((session) => sessionPeriod(session) === "morning");
    const afternoon = row.sessions.filter((session) => sessionPeriod(session) === "afternoon");
    return `<tr><td>${escapeHtml(row.name)}</td><td>${renderSessionCell(morning)}</td><td>${renderSessionCell(afternoon)}</td><td>${escapeHtml(row.total_display)}</td><td>${escapeHtml(row.status_text)}</td></tr>`;
  }).join("");
  return `<strong>📋 BÁO CÁO CHẤM CÔNG CUỐI NGÀY — ${displayDate(date)}</strong>` +
    `<br>Cập nhật: ${displayTime(updatedAt)}` +
    `<br><br><table border="1" cellpadding="6" cellspacing="0"><tr><th>Nhân sự</th><th>Ca sáng</th><th>Ca chiều</th><th>Tổng công</th><th>Trạng thái</th></tr>${body}</table>` +
    `<br><br><strong>Đánh giá &amp; lưu ý</strong><br>${dailyNotes(rows)}` + footer();
}

function validateRawReport(rawReport, expectedNames) {
  if (rawReport?.schema_version !== 5) throw new Error("Raw attendance report schema must be 5");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(rawReport?.date || ""))) throw new Error("Raw attendance report date is invalid");
  if (rawReport?.timezone !== TZ) throw new Error(`Raw attendance timezone must be ${TZ}`);
  if (!Array.isArray(rawReport?.employees)) throw new Error("Raw attendance employees must be an array");
  if (!Array.isArray(expectedNames) || expectedNames.length !== 8) throw new Error("Expected roster must contain exactly 8 names");
  if (rawReport.employees.length !== expectedNames.length) throw new Error("Raw attendance employee count does not match roster");
  rawReport.employees.forEach((employee, index) => {
    if (employee?.name !== expectedNames[index]) {
      throw new Error(`Employee order mismatch at position ${index + 1}`);
    }
  });
}

export function buildAttendanceBusinessReport(rawReport, slot, expectedNames) {
  validateRawReport(rawReport, expectedNames);
  if (!new Set(["morning_1230", "daily_2105"]).has(slot)) throw new Error("Unsupported attendance report slot");
  const rows = slot === "morning_1230"
    ? rawReport.employees.map(buildMorningEmployee)
    : rawReport.employees.map(buildDailyEmployee);
  const sourceReviewRows = rows.filter((row) => row.status_code === "source_review");
  const report = {
    schema_version: 1,
    kind: "attendance_business_report",
    slot,
    date: rawReport.date,
    timezone: TZ,
    generated_at: new Date().toISOString(),
    source_generated_at: rawReport.generated_at,
    employee_count: rows.length,
    employees: rows,
    quality: {
      technical_error_count: rows.filter((row) => row.status_code === "technical_error").length,
      review_required_count: rows.filter((row) => ["review_required", "source_review"].includes(row.status_code)).length,
      source_review_count: sourceReviewRows.length,
      stale_source_count: sourceReviewRows.filter((row) => row.source_issue_code === "source_history_stale").length,
      empty_source_count: sourceReviewRows.filter((row) => row.source_issue_code === "source_history_empty").length,
      open_session_count: rows.filter((row) => row.status_code === "open_session").length,
      accounted_employee_count: rows.length,
    },
  };
  report.teams_html = slot === "morning_1230"
    ? renderMorningHtml(report.date, report.source_generated_at || report.generated_at, rows)
    : renderDailyHtml(report.date, report.source_generated_at || report.generated_at, rows);
  return report;
}
