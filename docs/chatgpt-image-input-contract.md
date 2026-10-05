# ChatGPT Image input contract V1

The final attendance report must be an untouched ChatGPT Image output. The deterministic renderer path is not allowed. Do not substitute HTML, SVG, Chromium, canvas, compositing, overlays or a text-only report for the final image. Keep the 06:50 and 13:50 recurring tasks enabled if a run fails.

## Producer

Crawl fresh data, build the canonical report and the approved V9 visual request. The technical handoff sender independently rebuilds the visual request from the same canonical report and deep-compares every name, session, duration, status, date, update time and KPI before building the image input.

The display contract contains the exact header strings, four KPI label/value pairs, hours summary, complete overview, column definitions, eight complete employee rows and footer. All displayed values are strings; missing values remain as supplied. A person's multiple sessions must not be collapsed.

The image context contract is `ATTENDANCE_IMAGEGEN_ISOLATED_CONTEXT_V1`. The generated prompt begins with `BEGIN_ISOLATED_IMAGE_REQUEST`, carries the context version and a data fingerprint, explicitly invalidates earlier conversation/image content, contains the complete `DATA_INPUT`, and ends with the same fingerprint. The prompt never uses an old image, screenshot, sample roster or previous report as input.

The producer writes `output/chatgpt-image-input-<slot>-<date>.json` and `output/chatgpt-image-prompt-<slot>-<date>.txt`. Live data is never committed to the public repository. Existing encrypted artifacts retain these temporary outputs.

## Lossless technical handoff

The only source chat is `19:6050abd65a654287b59619ee92ff6cd3@thread.v2`. Keep marker `ATTENDANCE_AI_HANDOFF_V3` and require `INPUT_VERSION=ATTENDANCE_CHATGPT_IMAGE_INPUT_V1`, `CONTEXT_VERSION=ATTENDANCE_IMAGEGEN_ISOLATED_CONTEXT_V1`, request/date/slot/spec, source-report SHA-256, display-data SHA-256, full-input SHA-256, generation-prompt SHA-256 and byte count.

The human-readable `PROMPT_BEGIN` block is accompanied by the same complete input compressed between `INPUT_GZIP_BASE64_BEGIN` and `INPUT_GZIP_BASE64_END`. Gzip/base64 is transport encoding, not encryption. It permits exact reconstruction despite connector paragraph wrapping.

## Consumer input gate BEFORE image generation

1. Read the latest matching source message and the corresponding successful producer run/state. Reject the wrong date, slot, spec, request, old handoff, old state schema, missing V1 input, or missing isolated-context contract.
2. Save the full fetched message body as a local UTF-8 file. Load the exact decoder script and module from current `main`, not an old local copy.
3. Run `node scripts/prepare-chatgpt-image-input.mjs handoff.txt private-input-dir <source-message-id>`. This decodes the lossless envelope, verifies metadata, context version, hashes and byte count and writes `image-input.json`, `generation-prompt.txt`, `imagegen-context.txt` and `input-receipt.json`. No OCR is involved.
4. The image generation execution MUST be an isolated scheduled/one-off automation execution. An interactive conversation that already contains unrelated attendance images, old reports, brand samples, old dates, old KPIs or prior failed image prompts is diagnostic-only and MUST NOT call ChatGPT Image for publication.
5. In the isolated automation, after reading the ENTIRE `imagegen-context.txt`, do not emit commentary and do not call another connector/tool. The immediate next action must be a fresh ChatGPT Image generation. This makes the verified prompt the nearest active context to the image tool. Do not feed compressed base64 to the image model.
6. Never summarize the prompt to a few KPIs, never type a replacement prompt by hand, and never use an earlier failed image as a reference. Every retry must reload the SAME verified `imagegen-context.txt` and create from scratch.

The input receipt proves which decoded input was prepared. It is NOT evidence that the image model copied every character, NOT an image QA pass and NOT a Teams publication receipt.

## Independent output QA and delivery

Compare the generated image to every exact display string in `image-input.json`: report type/date/update, four KPI labels and values, hours/average, full overview, all eight names in order, every session and duration, totals/statuses, footer and no additional branding/text/report.

Discard and regenerate from the same complete verified context on failure, at most three attempts per run. If all fail, report the actual fields wrong and do not post. Do not change architecture or pause the recurring task.

Only a QA-passed direct PNG may use the existing OneDrive and schema-v3 `Attendance AI Image Post` path. Bind `source_prompt_sha256` to the new handoff's `PROMPT_SHA256`. Keep the real source message ID, date/slot and direct-image provenance flags. Confirm delivery only after the exact workflow succeeds and logs `ATTENDANCE_AI_TEAMS_MESSAGE_ID`. Never post a raw prompt/handoff in the TEST chat.
