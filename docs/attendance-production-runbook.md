**MORNING DETAILS PRODUCTION FIX (09/10/2026):** The `morning_1230` native Adaptive Card now includes source-bound, hidden eight-person morning details. The `Xem chi tiết ca sáng` and `Thu gọn chi tiết` buttons are sibling ActionSets around `morning-details-content` and use explicit `Action.ToggleVisibility` targets; the close button is never inside the collapsing panel. Each row shows the actual morning punch window, confirmed duration, converted workdays, attendance status and verified Entra account. No afternoon data is introduced in morning scope. The existing full-day reversible details, horizontal charts, Teams destination routing, idempotent receipts, and 06:50/13:50 scheduled delivery remain unchanged. This is enforced by CI and requires a new Teams client interaction check before visual acceptance.

**CONFIGURED GROUP-CHAT ROUTING — 09/10/2026:** GitHub Repository Variables `TEAMS_TARGET_TYPE=chat` and `TEAMS_CHAT_ID` are now the highest-priority destination inputs for `Attendance Crawl` (and the read-only target audit), matching the configuration shown in GitHub Settings. The configured chat is the official destination for scheduled `daily_2105` and `morning_1230` posts. Ordinary `design-preview-*` posts deliberately remain in the dedicated TEST chat. A one-time explicit `route-check-<slot>-<date>-<nonce>` trigger can publish the fresh, fully validated V24 card to the configured production group chat using a **separate `.github/attendance-native-previews/` receipt**. This does NOT replay or alter an existing production sent receipt. A route-check requires both `ATTENDANCE_NATIVE_PREVIEW=true` and `ATTENDANCE_NATIVE_ROUTE_CHECK=true`, a verified group-chat-shaped ID and a unique date/slot-bound request; it cannot target a channel or the TEST chat. Do not use another route-check after a successful sent receipt. Confirm the chat name and membership with Microsoft Teams before invoking; confirm the real message ID after publishing.

\n**TEAMS PRODUCTION DESTINATION LOCK (09/10/2026):** The native publisher no longer hardcodes the TEST chat for scheduled reports. Only `design-preview-*` uses the immutable TEST chat. Set GitHub Actions Variables or Secrets: for a production **chat**, `TEAMS_TARGET_TYPE=chat` and `TEAMS_CHAT_ID=<real chat id>`; for a production **channel**, `TEAMS_TARGET_TYPE=channel`, `TEAMS_TEAM_ID=<team GUID>`, and `TEAMS_CHANNEL_ID=<channel id>`. The `ATTENDANCE_TEAMS_*` equivalents take priority. Missing or ambiguous production destinations fail closed. Channel publishing uses Microsoft Graph `ChannelMessage.Send`; chat publishing uses `ChatMessage.Send`. Old `sent` receipts for TEST may not be blindly resent to the new destination. Do not publish production until destination permission and IDs have been verified in a real run.\n\n> **PRODUCTION CURRENT — 09/10/2026:** The authoritative published attendance format is the **native Microsoft Teams Adaptive Card V24**, built by `src/attendance-native-card.mjs` and posted by `scripts/post-native-attendance-production.mjs` in the GitHub `Attendance Crawl` workflow. This native production route supersedes the legacy ChatGPT Image / OneDrive / attendance-ai-post instructions below. For `daily_2105`, the *previous Asia/Ho_Chi_Minh calendar day* is posted at **06:50** following the **06:00** initial crawl and a verified **06:48** source refresh; the morning-only `morning_1230` report for *today* is posted at **13:50** following the **13:00** initial crawl and a verified **13:48** source refresh. Keep both schedules enabled. Profile photos and Persona components are deliberately disabled; names and verified Entra labels remain, with no avatar requirement. Daily Theo ca shows **one Chart.HorizontalBar.Stacked** with eight source-bound employee rows (teal morning, green afternoon), plus a separate Công quy đổi tab. Daily attendance details are hidden by default. The visible 'Xem giờ vào/ra đủ 8 nhân sự' and 'Thu gọn chi tiết' controls are **siblings of the hidden content**, switch visibility explicitly in both directions, and are validated by CI. Morning-only charts exclude afternoon values and daily detail controls. Standard production receipt `.github/attendance-publications/<slot>-<date>.json`: `sent` with message ID means no repost; `sending`/`uncertain` must be reconciled, never blind resend. Previews use separate `.github/attendance-native-previews/` receipts. Do not claim client behavior fully verified until an actual Teams mobile expand/collapse test. Scheduled production posts stay enabled even when a preview fails. The archival V10 document below is retained only for non-native legacy reference.

---

# Attendance production control V1

Applies to BOTH daily_2105 (previous Vietnam date, 06:50) and morning_1230
(current Vietnam date, 13:50). The paragraphs below describe the superseded V10 AI workflow. Current native V24 production crawls at 06:00/13:00 and independently revalidates sources immediately before posting. Read this file and chatgpt-image-input-contract.md from current main
on EVERY execution. Task prompts must not freeze a test date, old prompt or
old local file. ChatGPT Image direct output is mandatory. No renderer,
compositing, edits, replacement imagery, or external OpenAI API is permitted.

## Completion criteria

A configured schedule, successful crawl, verified input, image QA, and successful
Teams delivery are FIVE distinct states. Never describe any earlier state as
successful publication or verified end-to-end reliability. GitHub does not call
the ChatGPT UI; the ChatGPT task performs input preparation, image generation
and visual QA. Missing capabilities/permissions must be reported explicitly;
keep both recurring tasks enabled. Clock schedules are requested trigger times,
not guarantees of completion to the second.

## Producer watchdog and self-heal

The former V10 producer used 06:40/13:40 and legacy watchdog checks at 06:43/06:48 and 13:43/13:48; these timings are archival only. Current native V24 watchdog checks at 06:12/06:30/06:42/07:10 and 13:12/13:30/13:42/14:10 Vietnam time.

The watchdog is fail-closed. It first accepts an already-valid schema-12 state, then checks for an existing same-slot/same-date self-heal request, then checks whether Attendance Crawl is already queued/in_progress. Only when all three are absent does it write ONE audited request to `.github/attendance-rerun-trigger.json` with `delivery.enabled=false`. Because commits made by a workflow's `GITHUB_TOKEN` do not recursively start push-triggered workflows, the watchdog explicitly dispatches `Attendance Crawl` after committing the trigger. The producer therefore supports `workflow_dispatch` in addition to schedule and trigger-file push.

The watchdog never posts Teams, never disables the 06:50/13:50 ChatGPT schedules and never creates a second request for the same slot/date. The consumer still performs its own freshness check and remains authoritative for publication idempotency and visual QA.

## Each scheduled consumer

1. Determine target date in Asia/Ho_Chi_Minh and the task's own fixed slot.
   Read .github/attendance-publications/<slot>-<date>.json. If status=sent, report
   already delivered with the existing message ID, and do not generate/post again.
   If status=sending/uncertain, STOP automatic resend: reconcile the existing
   publisher run/log and actual Teams message. Do not clear the ledger blindly.
2. Check source state .github/attendance-state/<slot>.json. Require schema 12,
   publication_contract_version=ATTENDANCE_PUBLICATION_V1, input_gate=passed,
   input_contract_version=ATTENDANCE_CHATGPT_IMAGE_INPUT_V1,
   image_context_contract_version=ATTENDANCE_IMAGEGEN_ISOLATED_CONTEXT_V1,
   ai_visual_spec_version=ATTENDANCE_AI_VISUAL_V10_FLEX_VISUAL_STRICT_DATA_2026_10_05,
   correct date/slot.
   The exact Attendance Crawl run must be completed/success on main. If a matching
   producer is queued/in_progress, wait for it instead of starting another crawl.
   Missing/old state: create ONE unique request in attendance-rerun-trigger.json
   with schema_version=1, fixed slot, target_date, requested_at now,
   delivery.enabled=false. Follow its exact commit/run to completion. Do not
   reset this producer trigger after completion: changing it triggers another crawl.
   Retry a safe transient read once in the task; do not loop new producer requests.
3. Read attendance data ONLY from technical chat
   19:6050abd65a654287b59619ee92ff6cd3@thread.v2. Bind the newest handoff to the
   exact successful producer's message ID, request, date, slot and prompt hash.
   Use the lossless input decoder as documented. Load current repo files into
   the temporary execution workspace and run prepare-chatgpt-image-input.mjs.
   Save source state as producer-state.json. Reject mismatched hashes/contracts.
4. IMAGE CONTEXT ISOLATION IS A HARD GATE. Publication image generation may run only
   inside the scheduled/one-off automation execution, never from a long interactive
   chat that contains old attendance images/prompts/data. Run the decoder and require
   context_ready=true plus image_context_contract_version=ATTENDANCE_IMAGEGEN_ISOLATED_CONTEXT_V1.
   Read the ENTIRE decoded imagegen-context.txt. After that read, emit no commentary
   and call no other connector/tool: the immediate next action must be a fresh ChatGPT
   Image generation. This keeps the verified isolated context nearest to the image tool.
   Never shorten the data to a few KPIs or refer to an old image. The V10 prompt locks
   report data but intentionally allows fresh creative treatment: one short professional
   Vietnamese attendance slogan, up to three short nonnumeric attendance cue badges,
   and a varied realistic office/workspace background. Validate every locked report field
   against image-input.json; do not reject only because slogan/background/layout changed.
   Still reject logo/company name/watermark, fake date/time/number, invented attendance
   facts, wrong scope or a second report/page. For each retry, reload the SAME
   imagegen-context.txt and create from scratch, at most three attempts. Do not use
   fallback imagery and do not change attendance values.
5. On a genuinely passed visual inspection under V10, create private qa.json:
   status=passed, image_origin=chatgpt_image, generation_id=ACTUAL tool gen/file ID,
   image_sha256=SHA-256 of untouched PNG, source_data_sha256=input.data_sha256,
   checked_fields=ALL actual checks in QA_FIELDS exported by
   src/attendance-publication-control.mjs. Input hash verification is NOT visual QA.
   Do not mark checks complete without inspecting the image.
6. Upload that exact PNG temporarily to info@stacorp.net OneDrive. The filename
   must be attendance-daily-<date>-chatgpt-direct.png or
   attendance-morning-<date>-chatgpt-direct.png. Save drive_id/item_id/file_name
   from the successful upload as private upload.json.
7. Load current src/attendance-publication-control.mjs, src/attendance-routing.mjs,
   src/attendance-image-input.mjs, and scripts/build-attendance-post-trigger.mjs.
   Run:
   node scripts/build-attendance-post-trigger.mjs input-dir direct.png qa.json upload.json producer-state.json trigger.json
   This builds all hashes, summary fields and source bindings mechanically, without
   manually retyping KPIs. Commit the generated trigger.json verbatim to
   .github/attendance-ai-post-trigger.json on main (schema remains 3).
8. Follow the exact Attendance AI Image Post run. Only completed/success plus
   ATTENDANCE_AI_TEAMS_MESSAGE_ID and a stored sent receipt confirm delivery.
   The publisher resets only its own unchanged trigger. An already-sent ledger
   makes a repeated run a no-op. If cleanup needs retry, use compare-and-swap
   and a [skip ci] commit; never overwrite a newer trigger. Delete the temporary
   OneDrive PNG after confirmed delivery. Do not store images in public Git.

## Safety and recovery implemented in code

- Publisher checks current trigger, exact successful producer, all data/prompt/
  input/source hashes, summary digest and QA-to-image digest before sending.
- A durable per-slot/date claim is written before Teams POST, protected by the
  GitHub content SHA lease. Success stores the real message ID, not payroll data.
- Bounded backoff retries safe reads/token exchange and explicit HTTP 429.
  Message POST timeout/5xx is ambiguous: preserve the claim and do NOT auto-resend.
  A confirmed client rejection is recorded as rejected, so a corrected run can retry.
- Errors identify the actual stage. A cleanup failure cannot make an already
  delivered image publish again. Recurring tasks are never paused by a failed run.
- Producer state schema 12 proves the isolated-context contract was built and handed
  off; older schema 11 states are intentionally rejected by the ChatGPT consumer.
- The publication test suite runs in CI and before the publisher. Input/context
  contract tests remain separate. No test success proves that the image model itself
  copied every character; visual QA remains mandatory.

## Diagnostics without exposing attendance records

Read producer state, publication receipt and GitHub run logs. Do not commit live
names, sessions, decoded prompts or image bytes to the public repository. The
technical handoff is private. Gzip/base64 is encoding, not encryption. Never send
raw handoff/prompt/debug messages into the TEST publication chat.


## V10 visual QA boundary

The visual is not expected to be pixel-identical day to day. Freshness is desired.
QA MUST lock business data and report scope, but MUST allow:
- one short positive Vietnamese attendance slogan;
- up to three short nonnumeric attendance cue badges;
- fresh realistic office/workspace backgrounds and different lighting/composition;
- reasonable card/icon/layout variation.

QA MUST reject:
- any wrong/missing locked data value;
- wrong report type, wrong date/update time, wrong employee name/order;
- fabricated attendance numbers/times/statuses;
- logo, company/brand name, watermark;
- fake readable background signage/date/time/number;
- second report/page or mixed morning/full-day scope.
