# Attendance Timesheet Crawler

GitHub Actions + Playwright crawler for reading TimeMark / DaysCamera attendance pages without depending on a local PC.

## Security model

This repository is intentionally public, but attendance URLs, `deviceId` values, screenshots, locations and attendance results are **not** public source data.

- Employee URLs are supplied only through GitHub Actions repository secrets.
- The crawler never performs clock-in / clock-out actions; it is read-only.
- Scheduled runs do not print attendance times, locations or page text to Actions logs.
- Result files are encrypted before being uploaded as workflow artifacts.
- Raw text/screenshots are disabled for scheduled runs. Debug evidence is produced only on manual runs and is encrypted before upload.

## Schedule

The workflow runs at `11:45 UTC`, equivalent to `18:45 Asia/Ho_Chi_Minh`, every day. It can also be run manually from **Actions > Attendance Crawl > Run workflow**.

## Required repository secrets

Create these GitHub Actions secrets:

- `ATT_URL_DIEU_VAN_MANH`
- `ATT_URL_NGUYEN_THI_THUC_ANH`
- `ATT_URL_VU_DINH_TUE`
- `ATT_URL_BUI_DUY_HOANG`
- `ATT_URL_NGUYEN_THANH_LONG`
- `ATT_URL_TRAN_THANH_BINH`
- `ATT_URL_LE_THI_PHUONG_LINH`
- `ATT_URL_LE_DANG_HIEU`
- `ATTENDANCE_ARTIFACT_KEY`

Keep each original H5 URL exactly as supplied by the attendance app.

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

The plaintext JSON exists only inside the temporary GitHub runner. Before artifact upload it is encrypted with AES-256-CBC/PBKDF2 using `ATTENDANCE_ARTIFACT_KEY`.

## Local test

```bash
npm ci
npx playwright install chromium
npm test
```

To crawl locally, define the 8 `ATT_URL_*` variables and `node scripts/attendance-crawl.mjs`.

## Parser strategy

1. Open the exact employee URL.
2. Wait for the H5 SPA to render.
3. If the page is not a timesheet/history view, navigate only to a read-only timesheet/history surface.
4. Restrict extraction to the requested Vietnam calendar date.
5. Prefer an app-displayed working interval such as `07:23 - 11:37` on a `Tan ca` record.
6. Fall back to separate `Vào ca` / `Tan ca` timestamps only when a paired interval is unavailable.
7. Distinguish crawler/access failure from a genuinely missing attendance mark.

## Privacy note

Do not commit real attendance JSON, screenshots, raw page text, webhook URLs or employee H5 links to this public repository.
