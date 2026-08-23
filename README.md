# Attendance Timesheet Crawler

Read-only GitHub Actions attendance collector for TimeMark / DaysCamera. It runs without a local PC and keeps employee identities, H5 URLs, device IDs and attendance evidence out of the public source tree.

## Canonical operating model

```text
attendance-link-reader skill
  -> canonical 8-person roster + reporting rules

GitHub Actions
  -> private ATTENDANCE_ROSTER_JSON
  -> direct read-only attendance API
  -> structured parser + duration/evidence validation
  -> Playwright / Chromium fallback only when needed
  -> encrypted attendance JSON artifact
  -> non-sensitive scheduled-run state file

Scheduled report consumer
  -> validates the canonical skill roster
  -> waits for the matching scheduled-run state
  -> verifies date + slot + exact-roster fingerprint
  -> downloads exactly that run's artifact
  -> derives the same artifact key from the exact canonical roster
  -> decrypts and validates the JSON
  -> publishes at most one Teams message for the reporting milestone
```

The attendance app remains the source of punch times. GitHub Actions is the required execution layer that collects and normalizes that app data. Teams timestamps, image-upload timestamps, expected work schedules, old reports, old runs and old artifacts must never be used to invent or replace attendance times.

## Current architecture

The primary endpoint discovered from the H5 application is:

```text
POST https://app.dayscamera.com/next/attendance/record/query/plain
```

The direct request is bounded to the selected Vietnam calendar day and uses the `deviceId` already present in the private H5 URL. It does not submit clock-in or clock-out actions and does not require browser interaction during the normal successful path.

If direct API access fails, the workflow installs Playwright / Chromium and uses the original H5 page to capture the same read-only attendance response. DOM parsing is the final fallback.

## Schedule

GitHub cron is UTC; Vietnam is UTC+7 year-round. The source workflow runs every day, including weekends:

| Vietnam time | GitHub cron | Run slot | Target date |
|---|---|---|---|
| 12:30 | `30 5 * * *` | `morning_1230` | Current Vietnam date |
| 21:05 | `5 14 * * *` | `daily_2105` | Current Vietnam date |
| 06:45 | `45 23 * * *` | `final_0645` | Previous Vietnam date |

The ChatGPT/Teams reporting schedules may start at the same named milestone. They must not fail merely because the GitHub source run is still in progress. The consumer waits for the matching state file for up to its bounded wait window and only then reads the exact artifact identified by that state.

## Required repository secret

### `ATTENDANCE_ROSTER_JSON`

This is the only secret required by the scheduled crawler. It is a JSON array containing exactly the same eight employee/link mappings as the canonical `attendance-link-reader` skill.

Example with placeholders only:

```json
[
  { "name": "Employee 1", "url": "https://h5.timemark.com/attendance-management?..." },
  { "name": "Employee 2", "url": "https://h5.dayscamera.com/attendance-management?..." }
]
```

Keep every original H5 URL exactly as supplied by the attendance app. Only HTTPS URLs on `h5.timemark.com` and `h5.dayscamera.com` are accepted. The workflow requires exactly eight unique `deviceId` values.

A separate artifact-decryption secret is not required. The workflow derives the encryption passphrase deterministically from the exact ordered eight `(employee name, full canonical URL)` pairs using a domain-separated SHA-256 derivation. The original full URL text is used as-is; URL parameters are not reconstructed, reordered or normalized. The report consumer derives the same value from the canonical skill roster. A different domain-separated digest is used as the public-safe roster fingerprint, so publishing the fingerprint does not publish the encryption key.

This means a GitHub roster that differs from the skill roster by employee order, employee name, URL host, device ID, query value or URL parameter ordering will not match the scheduled consumer and will fail closed instead of silently producing a report from a different mapping.

## Scheduled-run state

After a successful scheduled artifact upload, GitHub Actions updates only the matching file under:

```text
.github/attendance-state/morning_1230.json
.github/attendance-state/daily_2105.json
.github/attendance-state/final_0645.json
```

The state file contains only non-sensitive routing metadata:

- schema version
- run ID and run attempt
- run slot
- target date
- artifact ID and artifact name
- one-way exact-roster fingerprint
- completion time

It contains no employee names, attendance times, H5 URLs, device IDs, photos, addresses or locations. Manual `workflow_dispatch` runs never overwrite the scheduled state files.

The state file is the canonical bridge between the scheduled GitHub producer and the scheduled report consumer. A consumer must reject a state file when the slot, date or roster fingerprint does not match the requested report.

## Security model

This repository is public, but employee names, attendance URLs, `deviceId` values, screenshots, locations and attendance results are not public source data.

- The complete employee roster is supplied only through `ATTENDANCE_ROSTER_JSON`.
- The collector is read-only and never calls a clock-in / clock-out endpoint.
- Scheduled logs contain aggregate status only; no employee names, times, locations, URLs or device IDs are printed.
- Result files are encrypted before artifact upload.
- The encryption key is derived only at runtime from the exact confidential canonical roster and is never committed or printed.
- Debug request/response evidence, raw page text and screenshots are allowed only inside encrypted manual-run artifacts.
- No `Authorization` or `Cookie` header is captured in debug request metadata.
- Scheduled state files contain routing metadata only and cannot be used as attendance evidence.

## API record model

The API parser uses structured fields instead of screen text when available:

- `recordSeq`: stable record identity used for deduplication.
- `state`: `0` = clock in, `3` = clock out.
- `date`, `time`: attendance calendar date and minute timestamp.
- `workingHours`: app-reported decimal hours on completed sessions.
- `address`, `lat`, `lng`: location evidence.
- `photoURL`: attendance photo evidence.

Records are reverse chronological. The parser pairs an output with the best preceding input using app evidence, removes contained zero/minute-level noise records, and classifies the session by its start time rather than by the clock-out hour. Therefore a morning session may legitimately end after 12:00.

## Fail-closed validation

For a completed pair, the collector compares exact elapsed minutes from Vào/Tan with `workingHours` converted from decimal hours. The accepted rounding tolerance is 3 minutes.

If the difference exceeds that tolerance, the result becomes `review_required`, `total_minutes` is set to `null`, and the candidate records remain only as evidence for manual review.

A valid exact-day API response with zero records is `date_not_found`; a network/runtime failure is `technical_error`. These states are deliberately different. A technical failure must never be reported as employee noncompliance.

## Normalized output

```json
{
  "name": "Employee",
  "data_source": "attendance_api_direct",
  "access_ok": true,
  "morning": {
    "in": "07:23",
    "out": "11:37",
    "minutes": 254,
    "duration_consistency": "aligned"
  },
  "afternoon": {
    "in": "13:25",
    "out": "18:04",
    "minutes": 279,
    "duration_consistency": "aligned"
  },
  "total_minutes": 533,
  "status": "complete"
}
```

## Scheduled consumer quality gate

Before any Teams report is sent, the consumer must prove all of the following:

1. `attendance-link-reader` roster validation returns `ROSTER OK` for exactly eight canonical employees.
2. The state file is for the exact expected run slot and target date.
3. The state exact-roster fingerprint equals the fingerprint derived from the exact ordered canonical skill `(name, full URL)` pairs.
4. The artifact ID/name comes from that state file; no old or alternate artifact is substituted.
5. The decrypted JSON has the expected schema, exact target date, `Asia/Ho_Chi_Minh` timezone and exactly eight employees matching canonical roster order/names.
6. Every reported punch comes from the app-derived JSON; no Teams timestamp, image-upload time, URL parameter or normal schedule is used as a punch.
7. Durations use complete, validated sessions only.
8. Teams is checked before work begins and immediately before sending; at most one official message or fail-closed error may be published per milestone/date.

If any gate fails after the bounded wait window, the consumer fails closed and publishes only the single permitted business-facing error notice. It does not reuse yesterday's data or another run.

## Validation coverage

The automated test suite covers direct API request construction and Vietnam date windows, absence of Authorization/Cookie headers, API envelope normalization, `recordSeq` deduplication, decimal `workingHours` conversion, reverse-ordered records, morning sessions ending after 12:00, duplicate/noisy punches, open sessions, duration mismatch fail-closed behavior, and H5/DOM fallback.

## Local test

```bash
npm install
npm test
npx playwright install chromium
```

To collect locally for development, set `ATTENDANCE_ROSTER_JSON`, then run:

```bash
npm run crawl
```

Local runs are development diagnostics only; scheduled production attendance execution remains GitHub-only.

## Manual debug run

Use **Actions > Attendance Crawl > Run workflow** and enable `debug=true`. Private debug payloads are bundled only inside the encrypted artifact. Manual runs do not update the scheduled state files.

## Privacy note

Do not commit real employee names, attendance JSON, screenshots, raw page text, device IDs, employee H5 links or other private attendance evidence to this public repository.
