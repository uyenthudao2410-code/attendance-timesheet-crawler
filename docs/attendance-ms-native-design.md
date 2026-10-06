# Attendance Microsoft-native card — design test V1

Status: isolated TEST only. This does not change the production crawler, image contract, publication ledger or 06:50 / 13:50 schedules.

## Why rebuild

The legacy test uses image charts and independently sized ColumnSets for tabular rows. JavaScript formatter functions are dropped by JSON.stringify, so the old external chart loses literal hour labels. The old fallback adds session durations when a daily total is unconfirmed; the native test must not present those sums as confirmed totals.

Microsoft's current Adaptive Card documentation supports native charts, Table, Icon and responsive targetWidth layouts in Teams. Avoid assuming all Designer features work in every host: TabSet, Accordion and dynamic properties are not used by this test.

## Composition

1. Compact title/date/source update time.
2. Four large KPI values in one short row, themed emphasis background.
3. One compact confirmed-hours/record-rate line.
4. Native vertical chart: all eight employees, known morning/afternoon sessions as separate stacked series. An open session has no quantitative bar segment. Minutes are exact integer unit conversions, not recomputed punch-time differences.
5. Action.ToggleVisibility switches to a confirmed-total chart. Only confirmed daily totals are plotted there. Literal totals remain in labels and the table.
6. One compact native status strip.
7. A real four-column Table for Standard/Wide; a two-column Table for Narrow/VeryNarrow. All eight employees and every literal session remain visible. One logical row per person, not a promise of one physical text line on a narrow screen.
8. One attention note and the full disclaimer.

Default text adapts to the Teams theme. Semantic colors distinguish confirmed, unclosed and reconciliation states. No white text forced on pale backgrounds. Rounded containers and Fluent icons are used sparingly; no arbitrary CSS/host style overrides.

## Source and safety

The source is an explicit design fixture copied from the previously used TEST input, date 2026-10-05, update 10:19. It is not a new crawl and must never be presented as a production publication.

The source fingerprint covers date, update time, KPIs, hours, rate, attention summary and all employee fields. Display strings are not recomputed, renamed, merged or rounded. Missing/unclosed totals are not zero. Multiple afternoon sessions remain separate.

The native test has no external chart URL, no screenshot, no AI image and no browser dependency. It uses existing delegated Microsoft secrets and verifies info@stacorp.net before posting to the fixed TEST chat. A separate native-test ledger protects against duplicate or uncertain sends.

## Acceptance gates

- node --test test/attendance-native-card.test.mjs
- All source strings present; exactly eight employees; four KPI values; fixed TEST destination.
- Chart schema fields reviewed against current Microsoft documentation; this is not an official schema-validator certification.
- Card JSON under 27 KB. No external images or preview-only components.
- Successful POST plus stored message receipt confirms transport only.
- Designer and real Teams desktop/web/mobile visual QA remain pending until viewed. Verify native chart rendering, chart switch, responsive table selection, complete names/sessions, light/dark theme, no clipped text.
- Do not migrate production until data, transport AND visual gates pass.

## Primary references

- https://adaptivecards.microsoft.com/designer
- https://adaptivecards.microsoft.com/?topic=Chart.VerticalBar
- https://adaptivecards.microsoft.com/?topic=Chart.VerticalBar.Grouped
- https://adaptivecards.microsoft.com/?topic=Chart.HorizontalBar.Stacked
- https://adaptivecards.microsoft.com/?topic=ColumnSet
- https://adaptivecards.microsoft.com/?topic=Table
- https://adaptivecards.microsoft.com/?topic=responsive-layout
- https://adaptivecards.microsoft.com/?topic=design-best-practices
- https://adaptivecards.microsoft.com/?topic=Icon
- https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/charts-in-adaptive-cards
