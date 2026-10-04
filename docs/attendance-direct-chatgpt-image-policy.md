# Attendance image publication policy

## Non-negotiable rule

The image posted to Microsoft Teams must be the **untouched direct output from ChatGPT Image** generated from the approved attendance prompt and the real attendance data.

If ChatGPT Image produces an incorrect image, the system must **regenerate through ChatGPT Image**. It must never repair the image with a downstream renderer.

## Forbidden after generation

- HTML/SVG/canvas re-rendering
- text or KPI overlays
- image compositing
- cropping a multi-panel image into a replacement final image
- replacing table cells or employee rows
- using the legacy attendance renderer or SVG masters
- any fallback renderer
- posting an image that has been edited after ChatGPT generation

## Publication gate

The Teams publication trigger must use schema v3 and declare:

- `image_origin = chatgpt_image`
- `direct_output = true`
- `edited_after_generation = false`
- `fallback_renderer_used = false`
- `qa_status = passed`

The final file name must be:

- `attendance-morning-YYYY-MM-DD-chatgpt-direct.png`
- `attendance-daily-YYYY-MM-DD-chatgpt-direct.png`

If any condition is false, publication must fail closed.

## QA

Before publication, compare the direct ChatGPT image against the handoff source. The image must contain the correct date, KPI values, totals and all eight employees. If QA fails, regenerate with ChatGPT Image; do not edit the failed image.
