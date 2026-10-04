# Attendance Mobile Strict-Data V9

Status: **APPROVED**  
Effective date: 2026-10-05  
Slots: `morning_1230`, `daily_2105`

## Priority order

1. Exact attendance data
2. Correct report scope
3. Mobile readability
4. Professional visual quality
5. Layout rigidity

Slight layout variation is allowed when it improves accuracy or phone readability.

## Shared mobile rules

- One portrait image only
- Preferred aspect: 2:3 to 9:16
- Large readable typography and KPI values
- Simple vertical reading flow
- No dense desktop dashboard requirement
- No logo, company-name mark, slogan, tagline, motivational quote, or invented decorative text
- All visible body text in Vietnamese
- Missing values: `—`
- All 8 employees exactly once and in source order
- Canonical spelling: `Điêu Văn Mạnh`
- Direct ChatGPT Image output only
- Never patch, crop, overlay, composite, or re-render after generation

## Morning V9

Marker: `APPROVED MORNING MOBILE V9 STRICT DATA`

Required reading order:

1. BÁO CÁO NHÂN SỰ
2. BÁO CÁO CHẤM CÔNG — CA SÁNG
3. Subtitle
4. Date + update time
5. Four KPI cards
6. Total-duration + average strip
7. Concise overview
8. Eight-employee detail section
9. Footer

Preferred detail fields:
`STT | Họ và tên | Trạng thái | Giờ vào | Giờ ra | Thời lượng | Mức công`

## Full-day V9

Marker: `APPROVED FULL-DAY MOBILE V9 STRICT DATA`

Required reading order:

1. BÁO CÁO NHÂN SỰ
2. BÁO CÁO CHẤM CÔNG — CẢ NGÀY
3. Subtitle
4. Date + update time
5. Four KPI cards
6. Total-hours + average strip
7. Concise overview
8. Eight-employee detail section
9. Footer

Preferred detail fields:
`STT | Họ và tên | Ca sáng | Ca chiều | Tổng công | Trạng thái`

## Fail-closed QA

Before Teams publication, compare the generated image against the technical handoff:

- report type
- date
- update time
- four KPI values
- total and average duration
- all 8 employees
- all displayed attendance values
- canonical spelling
- no second report
- no logo/slogan/extra invented text

If any field is wrong, discard and regenerate with ChatGPT Image. After three failed generations, do not publish.
