# Attendance Timesheet Crawler

Read-only GitHub Actions attendance collector for TimeMark / DaysCamera. It runs without a local PC and keeps employee identities, H5 URLs, device IDs and attendance evidence out of the public source tree.

## Current architecture

```text
GitHub Actions
  -> private roster secret
  -> direct read-only attendance API
  -> structured API parser
  -> duration/evidence validation
  -> encrypted JSON artifact

If direct API access fails:
  -> Playwright / Chromium
  -> H5 page
  -> captured attendance API response
  -> DOM parser only as final fallback
```

The primary endpoint discovered from the H5 application is:

```text
POST https://app.dayscamera.com/next/attendance/record/query/plain
```

The direct request is bounded to the selected Vietnam calendar day and uses the `deviceId` already present in the private H5 URL. It does not submit clock-in or clock-out actions and does not require browser interaction during the normal successful path.

## Security model

This repository is intentionally public, but employee names, attendance URLs, `deviceId` values, screenshots, locations and attendance results are **not** public source data.

- The complete employee roster is supplied through one GitHub Actions repository secret.
- The collector is read-only and never calls a clock-in / clock-out endpoint.
- Scheduled logs contain aggregate status only; no employee names, times, locations, URLs or device IDs are printed.
- Result files are encrypted before artifact upload.
- Debug request/response evidence, raw page text and screenshots are allowed only inside encrypted manual-run artifacts.
- No `Authorization` or `Cookie` header is captured in debug request metadata.

## Schedule

The workflow runs at `11:45 UTC`, equivalent to `18:45 Asia/Ho_Chi_Minh`, every day. It can also be run manually from **Actions > Attendance Crawl > Run workflow**.

## Required repository secrets

Create exactly these two GitHub Actions repository secrets:

### `ATTENDANCE_ROSTER_JSON`

A JSON array containing the private employee name and original H5 URL. Example with placeholders only:

```json
[
  { "name": "Employee 1", "url": "https://h5.timemark.com/attendance-management?..." },
  { "name": "Employee 2", "url": "https://h5.dayscamera.com/attendance-management?..." }
]
```

Keep every original H5 URL exactly as supplied by the attendance app. Only HTTPS URLs on `h5.timemark.com` and `h5.dayscamera.com` are accepted.

### `ATTENDANCE_ARTIFACT_KEY`

A strong private passphrase used to encrypt results before artifact upload. Keep it only in GitHub Secrets and a secure password manager.

GitHub path: **Repository > Settings > Secrets and variables > Actions > New repository secret**.

## API record model

The API parser uses structured fields instead of screen text when available:

- `recordSeq`: stable record identity used for deduplication.
- `state`: `0` = clock in, `3` = clock out.
- `date`, `time`: attendance calendar date and minute timestamp.
- `workingHours`: app-reported decimal hours on completed sessions.
- `address`, `lat`, `lng`: location evidence.
- `photoURL`: attendance photo evidence.

Records are reverse chronological. The parser pairs an output with the best preceding input using the app-reported `workingHours` as evidence, removes contained zero/minute-level noise records, and classifies the session by its start time rather than by the clock-out hour. Therefore a morning session may legitimately end after 12:00.

## Fail-closed validation

For a completed pair, the collector compares:

```text
exact elapsed minutes from Vào/Tan
vs.
workingHours converted from decimal hours
```

A small difference is expected because `workingHours` is rounded. The accepted tolerance is **3 minutes**.

If the difference exceeds that tolerance:

- the result becomes `review_required`;
- `total_minutes` is set to `null`;
- the candidate records remain only as evidence for manual review.

This prevents noisy or duplicate punches from silently becoming a trusted work session.

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

A valid exact-day API response with zero records is `date_not_found`; a network/runtime failure is `technical_error`. These states are deliberately different.

## Validation coverage

The automated test suite covers:

- direct API request construction and Vietnam date window;
- absence of Authorization/Cookie headers;
- API envelope and record normalization;
- recordSeq deduplication;
- decimal `workingHours` conversion;
- reverse-ordered table records;
- morning sessions ending after 12:00;
- duplicate/noisy punches;
- open sessions without invented clock-out values;
- API duration mismatch fail-closed behavior;
- legacy H5/DOM parsing fallback.

## Local test

```bash
npm install
npm test
npx playwright install chromium
```

To collect locally, set `ATTENDANCE_ROSTER_JSON`, then run:

```bash
npm run crawl
```

## Manual debug run

Use **Actions > Attendance Crawl > Run workflow** and enable `debug=true`. Private debug payloads are bundled only inside the encrypted artifact. Do not expose decrypted debug files publicly.

## Privacy note

Do not commit real employee names, attendance JSON, screenshots, raw page text, webhook URLs, device IDs or employee H5 links to this public repository.
