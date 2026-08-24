export function shouldBrowserVerifyAttendance(attendance) {
  return !attendance || attendance.status === "date_not_found";
}

export function chooseBrowserAttendance(apiAttendance, domAttendance) {
  const apiHasTargetDate = apiAttendance && apiAttendance.status !== "date_not_found";
  const domHasTargetDate = domAttendance && domAttendance.status !== "date_not_found";

  if (apiHasTargetDate) {
    return {
      attendance: apiAttendance,
      source_disagreement: null,
      recovered_from_dom: false,
    };
  }

  if (domHasTargetDate) {
    return {
      attendance: {
        ...domAttendance,
        data_source: "rendered_dom_verified_after_api_miss",
      },
      source_disagreement: apiAttendance ? "api_date_not_found_but_dom_found" : null,
      recovered_from_dom: true,
    };
  }

  return {
    attendance: apiAttendance ?? domAttendance ?? null,
    source_disagreement: null,
    recovered_from_dom: false,
  };
}

function dateToUtcDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 86400000) : null;
}

export function classifyDateNotFoundSource(history, targetDate, staleAfterDays = 7) {
  if (!history || history.history_record_count == null) {
    return "target_date_not_found_unverified_history";
  }

  if (history.history_record_count === 0) {
    return "link_history_empty_needs_verification";
  }

  const latestDay = dateToUtcDay(history.latest_record_date);
  const targetDay = dateToUtcDay(targetDate);
  if (latestDay != null && targetDay != null) {
    const ageDays = targetDay - latestDay;
    if (ageDays >= staleAfterDays) {
      return "link_history_stale_needs_verification";
    }
  }

  return "target_date_not_found";
}
