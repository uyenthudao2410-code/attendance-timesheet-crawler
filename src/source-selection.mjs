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

export function classifyDateNotFoundSource(history, _targetDate, _staleAfterDays = 7) {
  if (!history || history.history_record_count == null) {
    return "target_date_not_found_unverified_history";
  }

  if (history.history_record_count === 0) {
    return "link_history_empty_needs_verification";
  }

  // ATTENDANCE_ROSTER_JSON is the administrator-owned canonical source mapping.
  // A readable source with historical records is healthy enough to establish that
  // the target date has no attendance record. The age of the latest prior record
  // must not by itself reclassify a canonical link as stale/broken because the
  // employee may simply have been on leave or otherwise had no attendance records.
  return "target_date_not_found";
}
