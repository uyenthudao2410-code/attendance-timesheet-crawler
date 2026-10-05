# ChatGPT Image input contract V1

The final attendance report must be an untouched ChatGPT Image output. The deterministic renderer path was introduced without approval and is removed. Do not substitute HTML, SVG, Chromium, canvas, compositing, overlays or a text-only report for the final image. Keep the 06:50 and 13:50 recurring tasks enabled if a run fails.

## Producer

Crawl fresh data, build the canonical report and the existing approved V9 visual request. The technical handoff sender independently rebuilds the visual request from the same canonical report and deep-compares every name, session, duration, status, date, update time and KPI before building the image input. It does not change the crawler or attendance accounting rules.

The display contract contains the exact header strings, four KPI label/value pairs, hours summary, complete overview, column definitions, eight complete employee rows and footer. All displayed values are strings; missing values remain as supplied. A person's multiple morning sessions must not be collapsed.

`generation_prompt` starts with the complete DATA_INPUT JSON and ends with separate art direction. No old image, screenshot, sample roster or earlier generated output is an input reference. The prompt explicitly excludes prior image data.

The producer writes `output/chatgpt-image-input-<slot>-<date>.json` and `output/chatgpt-image-prompt-<slot>-<date>.txt`. Live data is never committed to the public repository. Existing encrypted artifacts retain these temporary outputs.

## Lossless technical handoff

The only source chat is `19:6050abd65a654287b59619ee92ff6cd3@thread.v2`. Keep marker `ATTENDANCE_AI_HANDOFF_V3` and add `INPUT_VERSION=ATTENDANCE_CHATGPT_IMAGE_INPUT_V1`, request/date/slot/spec, source-report SHA-256, display-data SHA-256, full-input SHA-256, generation-prompt SHA-256 and byte count.

The human-readable `PROMPT_BEGIN` block is accompanied by the same complete input compressed between `INPUT_GZIP_BASE64_BEGIN` and `INPUT_GZIP_BASE64_END`. Gzip/base64 is transport encoding, not encryption: this stays in the authorized technical chat. It permits exact reconstruction despite connector paragraph wrapping.

## Consumer input gate BEFORE image generation

1. Read the latest matching source message and the corresponding successful producer run/state. Reject the wrong date, report slot, spec, request or old handoff without V1 input.
2. Save the full fetched message body as a local UTF-8 file. Load the exact decoder script and module from the current repository, not from an old local copy.
3. Run `node scripts/prepare-chatgpt-image-input.mjs handoff.txt private-input-dir <source-message-id>`. This decodes the lossless envelope, verifies metadata and hashes and writes `image-input.json`, `generation-prompt.txt` and `input-receipt.json`. No OCR is involved.
4. Read the ENTIRE decoded `generation-prompt.txt` immediately before calling ChatGPT Image. Do not replace it with a summary such as 'use all supplied data'. Where the tool uses conversation context rather than an explicit prompt argument, place the complete verified prompt text into active context immediately before invocation. Do not feed compressed base64 to the image model.
5. Generate one new portrait image from that input. Never edit or reuse an earlier failed image as a reference.

The input receipt proves which decoded input was prepared. It is NOT evidence of an image model's internal prompt processing, NOT an image QA pass and NOT a Teams publication receipt.

## Independent output QA and delivery

Compare the generated image to every exact display string in `image-input.json`: report type/date/update, four KPI labels and values, hours/average, full overview, all eight names in order, every morning/afternoon session and duration, total/status, footer and no additional report/branding/text. A source hash alone cannot pass output QA.

Discard and regenerate from the same complete verified prompt on failure, at most three attempts per run. If all fail, report the actual fields wrong and do not post. Do not change architecture or pause the recurring task.

Only a QA-passed direct PNG may use the existing OneDrive and schema-v3 `Attendance AI Image Post` path. Bind `source_prompt_sha256` to the new handoff's PROMPT_SHA256, not the legacy V9 prompt hash. Keep real source message ID, date/slot and direct-image provenance flags. Confirm delivery only after the exact workflow succeeds and logs `ATTENDANCE_AI_TEAMS_MESSAGE_ID`. Never post a raw prompt/handoff in the TEST chat.
