# Attendance production control V1

Applies to BOTH daily_2105 (previous Vietnam date, 06:50) and morning_1230
(current Vietnam date, 13:50). The GitHub producer remains scheduled at 06:40
and 13:40. Read this file and chatgpt-image-input-contract.md from current main
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

## Each scheduled consumer

1. Determine target date in Asia/Ho_Chi_Minh and the task's own fixed slot.
   Read .github/attendance-publications/<slot>-<date>.json. If status=sent, report
   already delivered with the existing message ID, and do not generate/post again.
   If status=sending/uncertain, STOP automatic resend: reconcile the existing
   publisher run/log and actual Teams message. Do not clear the ledger blindly.
2. Check source state .github/attendance-state/<slot>.json. Require schema 12,
   publication_contract_version=ATTENDANCE_PUBLICATION_V1, input_gate=passed,
   input_contract_version=ATTENDANCE_CHATGPT_IMAGE_INPUT_V1,
   image_context_contract_version=ATTENDANCE_IMAGEGEN_ISOLATED_CONTEXT_V1, correct date/slot.
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
   Never shorten the data to a few KPIs or refer to an old image. Validate every field
   against image-input.json. For each retry, reload the SAME imagegen-context.txt and
   create from scratch, at most three attempts. Do not use fallback imagery and do not
   change attendance values.
5. On a genuinely passed visual inspection, create private qa.json:
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
