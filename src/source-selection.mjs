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
