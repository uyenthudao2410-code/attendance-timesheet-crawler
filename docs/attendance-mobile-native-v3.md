# Attendance mobile native V3 — TEST rollout

Layout: `ATTENDANCE_MOBILE_NATIVE_V3`.

## Presentation
- Four large KPI values in one compact row; confirmed hours and record rate beneath.
- One small native stacked status chart.
- Full employee names in original source order. Each employee is one integrated block:
  name + literal total/status, horizontal session bar, then exact morning/afternoon strings.
- No separate employee table, no two large vertical charts, no repeated per-employee legend.
- A single optional `Action.ToggleVisibility` panel compares confirmed totals using
  `Chart.HorizontalBar` in `AbsoluteNoAxis` mode. All employee details remain visible
  regardless of that panel. This avoids rendering two long employee lists at once.
- Native `RichTextBlock` wraps naturally at phone widths. Do not force every person
  onto one physical line, truncate names, or remove multiple sessions to save height.

## Data meaning
Per-employee `Chart.HorizontalBar.Stacked` bars describe the proportions of known
sessions, not comparable daily totals. The native number at the right is the sum
of those session minutes; the literal source total/status is displayed separately.
Do not compare the lengths of independently normalized session bars.

The optional confirmed-total chart uses a single absolute scale in integer minutes
and includes only confirmed employees. Its category labels include full names and
the literal hour values. Unknown totals are omitted, not converted to zero.
No rounded decimal hours or invented confirmed totals are allowed.
Open sessions retain their exact input text and contribute no invented duration.
Multiple sessions stay separate, including any extra afternoon segment.

Colors distinguish morning (categoricalBlue), afternoon (categoricalGreen), extra
afternoon session (categoricalTeal). Status text uses semantic Good/Warning/Attention.
Avoid light text on pastel backgrounds.

## Isolation and delivery
This rollout updates only the native TEST module, tests, documentation and trigger.
It reuses `test/fixtures/attendance-native-card-input.json` for 2026-10-05 at 10:19
with source SHA-256 `cedcad7b9226d6009a0e516aa1fcb198cf8e715276a060831125fb9c30336f6e`.
This is a design test, not a fresh attendance crawl or production publication.
No production state, image contracts, recurring schedules or watchdogs are changed.

Use the existing `Attendance Native Card Test` workflow and publisher. Its durable
claim/receipt prevents duplicate sends for the same request. A sending/uncertain
receipt must be reconciled, not reset for an automatic resend.

Completion requires the exact workflow completed/success, the native Teams
message ID in logs and the matching receipt status=sent. That proves delivery,
not visual QA. Real Teams phone and desktop rendering remains pending until
actually inspected.

## Checks
Run `node --check src/attendance-native-card.mjs` and
`node --test test/attendance-native-card.test.mjs` before activating the trigger.
The audit checks exact deterministic layout/data, source order, native-only visuals,
unique IDs, no truncation, no invented durations, and a 27 KB card budget.
It does not claim an official schema validation or screenshot-based render pass.

Official references:
- https://adaptivecards.microsoft.com/?topic=Chart.HorizontalBar
- https://adaptivecards.microsoft.com/?topic=Chart.HorizontalBar.Stacked
- https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/charts-in-adaptive-cards
