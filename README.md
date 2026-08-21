# Attendance Timesheet Crawler

GitHub Actions + Playwright crawler for reading TimeMark / DaysCamera attendance pages without depending on a local PC.

## Security model

This repository is intentionally public, but employee names, attendance URLs, `deviceId` values, screenshots, locations and attendance results are **not** public source data.

- The complete employee roster is supplied through one GitHub Actions repository secret.
- The crawler never performs clock-in / clock-out actions; it is read-only.
- Scheduled runs do not print employee names, attendance times, locations, URLs or page text to Actions logs.
- Result files are encrypted before being uploaded as workflow artifacts.
- Raw text/screenshots are disabled for scheduled runs. Debug evidence is produced only on manual runs and is encrypted before upload.

## Schedule

The workflow runs at `11:45 UTC`, equivalent to `18:45 Asia/Ho_Chi_Minh`, every day. It can also be run manually from **Actions > Attendance Crawl > Run workflow**.

## Required repository secrets

Create exactly these two GitHub Actions secrets:

### `ATTENDANCE_ROSTER_JSON`

A JSON array containing the private employee name and original H5 URL. Example with placeholders only:

```json
[
  { "name": "Employee 1", "url": "https://h5.timemark.com/attendance-management?..." },
  { "name": "Employee 2", "url": "https://h5.dayscamera.com/attendance-management?..." }
]
```

Keep every original H5 URL exactly as supplied by the attendance app. The crawler accepts only HTTPS URLs on `h5.timemark.com` and `h5.dayscamera.com`.

### `ATTENDANCE_ARTIFACT_KEY`

A strong private passphrase used to encrypt workflow results before artifact upload. Store it only as a repository secret and in your own secure password manager.

GitHub path: **Repository > Settings > Secrets and variables > Actions > New repository secret**.

## Output

The crawler normalizes each employee to:

```json
{
  "name": "Employee",
  "access_ok": true,
  "morning": { "in": "07:23", "out": "11:37", "minutes": 254 },
  "afternoon": { "in": "13:25", "out": "18:04", "minutes": 279 },
  "total_minutes": 533,
  "missing": [],
  "status": "complete"
}
```

The plaintext JSON exists only inside the temporary GitHub runner. Before artifact upload, the runner packs the result and encrypts it with AES-256-CBC + PBKDF2 using `ATTENDANCE_ARTIFACT_KEY`. Only the `.enc` file is uploaded.

## Local test

```bash
npm install
npm test
npx playwright install chromium
```

To crawl locally, set `ATTENDANCE_ROSTER_JSON`, then run:

```bash
npm run crawl
```

## Parser strategy

1. Open the exact employee URL.
2. Wait for the H5 SPA to render.
3. If the page is not a timesheet/history view, navigate only to a read-only timesheet/history surface.
4. Restrict extraction to the requested Vietnam calendar date.
5. Prefer an app-displayed working interval such as `07:23 - 11:37` on a `Tan ca` record.
6. Fall back to separate `Vào ca` / `Tan ca` timestamps only when a paired interval is unavailable.
7. Distinguish crawler/access failure from a genuinely missing attendance mark.

## Manual debug run

Use **Actions > Attendance Crawl > Run workflow** and enable `debug=true`. Raw page text and screenshots are bundled only inside the encrypted artifact. Do not expose decrypted debug files publicly.

## Privacy note

Do not commit real employee names, attendance JSON, screenshots, raw page text, webhook URLs or employee H5 links to this public repository.
